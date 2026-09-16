import asyncio
import json
import logging
import math
import ssl
from time import monotonic
from typing import Any

import httpx

from sanposcape.config import Settings
from sanposcape.integrations.google_maps.cache import SingleFlight, TtlCache
from sanposcape.integrations.google_maps.exceptions import (
    GoogleMapsQuotaError,
    GoogleMapsUnavailableError,
)
from sanposcape.integrations.google_maps.fake import FakeGoogleMapsProvider
from sanposcape.integrations.google_maps.provider import (
    GoogleMapsProvider,
    ProviderPlace,
    ProviderPoint,
    ProviderRoute,
)

logger = logging.getLogger(__name__)

_CATEGORY_TYPES = {
    "convenience_store": "convenience_store",
    "supermarket": "supermarket",
    "retail": "store",
    "facility": "community_center",
    "park": "park",
    "station": "train_station",
}
_PLACES_BASE_URL = "https://places.googleapis.com/v1"
_ROUTES_BASE_URL = "https://routes.googleapis.com/directions/v2"


class UnconfiguredGoogleMapsProvider:
    """Safe local/test default: no outbound request can occur without a server key."""

    def search_places(
        self,
        origin: ProviderPoint,
        categories: tuple[str, ...],
        limit: int,
        *,
        timeout_seconds: float,
    ) -> tuple[ProviderPlace, ...]:
        raise GoogleMapsUnavailableError()

    def get_walking_route(
        self, origin: ProviderPoint, destination: ProviderPoint, *, timeout_seconds: float
    ) -> ProviderRoute:
        raise GoogleMapsUnavailableError()

    def get_walking_routes(
        self,
        origin: ProviderPoint,
        destination: ProviderPoint,
        *,
        timeout_seconds: float,
        intermediates: tuple[ProviderPoint, ...] = (),
        alternatives: bool = False,
    ) -> tuple[ProviderRoute, ...]:
        raise GoogleMapsUnavailableError()


class HttpGoogleMapsProvider:
    def __init__(
        self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self._key = settings.google_maps_server_api_key
        self._transport = transport
        # Reuse SSL configuration; each bounded request owns and closes its connections.
        self._ssl_context = ssl.create_default_context()
        self._places_cache: TtlCache[tuple[ProviderPlace, ...]] = TtlCache(
            settings.google_maps_cache_ttl_seconds, settings.google_maps_cache_max_entries
        )
        self._routes_cache: TtlCache[ProviderRoute] = TtlCache(
            settings.google_maps_cache_ttl_seconds, settings.google_maps_cache_max_entries
        )
        self._route_options_cache: TtlCache[tuple[ProviderRoute, ...]] = TtlCache(
            settings.google_maps_cache_ttl_seconds, settings.google_maps_cache_max_entries
        )
        self._route_options_flight: SingleFlight[tuple[ProviderRoute, ...]] = SingleFlight()
        self._places_flight: SingleFlight[tuple[ProviderPlace, ...]] = SingleFlight()
        self._routes_flight: SingleFlight[ProviderRoute] = SingleFlight()

    def search_places(
        self,
        origin: ProviderPoint,
        categories: tuple[str, ...],
        limit: int,
        *,
        timeout_seconds: float,
    ) -> tuple[ProviderPlace, ...]:
        key = self._places_key(origin, categories, limit)
        cached = self._places_cache.get(key)
        if cached is not None:
            return cached
        deadline = monotonic() + timeout_seconds
        try:
            return self._places_flight.do(
                key,
                lambda: self._load_places(key, origin, categories, limit, deadline - monotonic()),
                timeout=timeout_seconds,
            )
        except TimeoutError as exc:
            raise GoogleMapsUnavailableError() from exc

    def _load_places(
        self,
        key: str,
        origin: ProviderPoint,
        categories: tuple[str, ...],
        limit: int,
        timeout_seconds: float,
    ) -> tuple[ProviderPlace, ...]:
        cached = self._places_cache.get(key)
        if cached is not None:
            return cached
        payload = {
            "includedTypes": [_CATEGORY_TYPES[category] for category in categories],
            "languageCode": "ja",
            "maxResultCount": limit,
            "locationRestriction": {"circle": {"center": self._lat_lng(origin), "radius": 2000.0}},
            "regionCode": "JP",
        }
        response = self._request(
            "POST",
            f"{_PLACES_BASE_URL}/places:searchNearby",
            json=payload,
            headers={
                "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.types"
            },
            timeout_seconds=timeout_seconds,
        )
        places: list[ProviderPlace] = []
        for place in response.get("places", []):
            parsed_place = self._parse_place(place, categories)
            if parsed_place is not None:
                places.append(parsed_place)
        result = tuple(places)
        self._places_cache.put(key, result)
        return result

    def get_walking_route(
        self, origin: ProviderPoint, destination: ProviderPoint, *, timeout_seconds: float
    ) -> ProviderRoute:
        key = self._route_key(origin, destination)
        cached = self._routes_cache.get(key)
        if cached is not None:
            return cached
        return self._routes_flight.do(
            key, lambda: self._load_route(key, origin, destination, timeout_seconds)
        )

    def _load_route(
        self, key: str, origin: ProviderPoint, destination: ProviderPoint, timeout_seconds: float
    ) -> ProviderRoute:
        cached = self._routes_cache.get(key)
        if cached is not None:
            return cached
        response = self._request(
            "POST",
            f"{_ROUTES_BASE_URL}:computeRoutes",
            json={
                "origin": {"location": {"latLng": self._lat_lng(origin)}},
                "destination": {"location": {"latLng": self._lat_lng(destination)}},
                "travelMode": "WALK",
            },
            headers={
                "X-Goog-FieldMask": (
                    "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline"
                )
            },
            timeout_seconds=timeout_seconds,
        )
        routes = response.get("routes", [])
        if not routes:
            raise GoogleMapsUnavailableError()
        route = routes[0]
        result = ProviderRoute(
            duration_seconds=self._duration_seconds(route.get("duration")),
            distance_meters=int(route.get("distanceMeters", 0)),
            path=tuple(self._decode_polyline(route.get("polyline", {}).get("encodedPolyline", ""))),
        )
        if len(result.path) < 2:
            raise GoogleMapsUnavailableError()
        self._routes_cache.put(key, result)
        return result

    def get_walking_routes(
        self,
        origin: ProviderPoint,
        destination: ProviderPoint,
        *,
        timeout_seconds: float,
        intermediates: tuple[ProviderPoint, ...] = (),
        alternatives: bool = False,
    ) -> tuple[ProviderRoute, ...]:
        # Separate namespace: a default route must never satisfy an alternatives request.
        key = repr(("walking-options-v1", origin, destination, intermediates, alternatives))
        deadline = monotonic() + timeout_seconds

        def load() -> tuple[ProviderRoute, ...]:
            cached = self._route_options_cache.get(key)
            if cached is not None:
                return cached
            remaining = deadline - monotonic()
            if remaining <= 0:
                raise GoogleMapsUnavailableError()
            payload = {
                "origin": {"location": {"latLng": self._lat_lng(origin)}},
                "destination": {"location": {"latLng": self._lat_lng(destination)}},
                "travelMode": "WALK",
                "computeAlternativeRoutes": alternatives and not intermediates,
                "polylineQuality": "HIGH_QUALITY",
            }
            if intermediates:
                payload["intermediates"] = [
                    {"location": {"latLng": self._lat_lng(point)}} for point in intermediates
                ]
            response = self._request(
                "POST",
                f"{_ROUTES_BASE_URL}:computeRoutes",
                json=payload,
                headers={
                    "X-Goog-FieldMask": (
                        "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline"
                    )
                },
                timeout_seconds=remaining,
            )
            if monotonic() > deadline:
                raise GoogleMapsUnavailableError()
            raw = response.get("routes", [])
            if not isinstance(raw, list):
                raise GoogleMapsUnavailableError()
            routes = []
            for route in raw:
                try:
                    duration = self._duration_seconds(route["duration"])
                    distance = int(route["distanceMeters"])
                    path = tuple(self._decode_polyline(route["polyline"]["encodedPolyline"]))
                except (KeyError, TypeError, ValueError, OverflowError) as exc:
                    raise GoogleMapsUnavailableError() from exc
                if (
                    duration < 0
                    or distance < 0
                    or any(
                        not -90 <= point.latitude <= 90 or not -180 <= point.longitude <= 180
                        for point in path
                    )
                ):
                    raise GoogleMapsUnavailableError()
                # A route at the same point can legitimately be zero length.
                if duration > 0 and distance > 0 and len(path) >= 2:
                    routes.append(ProviderRoute(duration, distance, path))
            result = tuple(routes)
            if monotonic() > deadline:
                raise GoogleMapsUnavailableError()
            if result:
                self._route_options_cache.put(key, result)
            return result

        try:
            return self._route_options_flight.do(key, load, timeout=timeout_seconds)
        except TimeoutError as exc:
            raise GoogleMapsUnavailableError() from exc

    def _request(self, method: str, url: str, **kwargs: Any) -> dict[str, Any]:
        timeout_seconds = kwargs.pop("timeout_seconds")
        deadline = monotonic() + timeout_seconds
        if timeout_seconds <= 0:
            raise GoogleMapsUnavailableError()

        async def request() -> httpx.Response:
            # Per-read timeouts do not stop slow trickle responses. Cancel the entire
            # operation (including body consumption) when the wall-clock budget expires.
            async with asyncio.timeout(timeout_seconds):
                async with httpx.AsyncClient(
                    transport=self._transport, verify=self._ssl_context
                ) as client:
                    return await client.request(
                        method,
                        url,
                        headers={"X-Goog-Api-Key": self._key, **kwargs.pop("headers", {})},
                        timeout=timeout_seconds,
                        **kwargs,
                    )

        try:
            loop = asyncio.new_event_loop()
            try:
                response = loop.run_until_complete(request())
            finally:
                # asyncio.run waits for DNS executor threads during shutdown, even
                # after cancellation. Closing this request-owned loop releases its
                # executor without waiting for a stalled system resolver.
                loop.close()
        except (TimeoutError, httpx.TimeoutException) as exc:
            logger.warning("Google Maps request timed out: %s %s", method, _endpoint(url))
            raise GoogleMapsUnavailableError() from exc
        except httpx.HTTPError as exc:
            logger.warning(
                "Google Maps request failed: %s %s (%s)",
                method,
                _endpoint(url),
                type(exc).__name__,
            )
            raise GoogleMapsUnavailableError() from exc
        if response.status_code == 429:
            self._log_error_response(method, url, response)
            raise GoogleMapsQuotaError()
        if response.status_code >= 500:
            self._log_error_response(method, url, response)
            raise GoogleMapsUnavailableError()
        try:
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, json.JSONDecodeError, ValueError) as exc:
            self._log_error_response(method, url, response)
            raise GoogleMapsUnavailableError() from exc
        if monotonic() > deadline:
            raise GoogleMapsUnavailableError()
        return body if isinstance(body, dict) else {}

    def _log_error_response(self, method: str, url: str, response: httpx.Response) -> None:
        """Google のエラー応答の要点をサーバーログに残す。

        クライアントには 429/503 しか返さない（外部の詳細を漏らさない）方針だが、サーバー側にも
        何も残らないと「なぜ 503 なのか」を追えない。設定ミス（APIキーのアプリケーション制限違反・
        API未有効化・請求先未設定）はいずれも Google からは 403 で返り、原因は `error.status` と
        `error.details[].reason` にしか出ないため、その2つを必ず記録する。

        APIキーはリクエストヘッダにしか載せていないので本来ログには現れないが、
        万一 Google の文言に含まれても出力されないよう `_redact_key()` を通す。
        """
        status, reasons, message = _parse_google_error(response)
        logger.warning(
            "Google Maps API error: %s %s -> HTTP %s status=%s reasons=%s message=%s",
            method,
            _endpoint(url),
            response.status_code,
            status or "-",
            ",".join(reasons) if reasons else "-",
            self._redact_key(message) if message else "-",
        )

    def _redact_key(self, text: str) -> str:
        if self._key and self._key in text:
            return text.replace(self._key, "***")
        return text

    def close(self) -> None:
        """Connections are closed inside each bounded request."""

    @staticmethod
    def _lat_lng(point: ProviderPoint) -> dict[str, float]:
        return {"latitude": point.latitude, "longitude": point.longitude}

    @staticmethod
    def _duration_seconds(value: object) -> int:
        if not isinstance(value, str) or not value.endswith("s"):
            raise GoogleMapsUnavailableError()
        try:
            return int(float(value[:-1]))
        except ValueError as exc:
            raise GoogleMapsUnavailableError() from exc

    @staticmethod
    def _parse_place(place: object, requested_categories: tuple[str, ...]) -> ProviderPlace | None:
        if not isinstance(place, dict):
            raise GoogleMapsUnavailableError()
        location = place.get("location")
        if not isinstance(location, dict):
            raise GoogleMapsUnavailableError()
        raw_types = place.get("types", [])
        if not isinstance(raw_types, list) or not all(isinstance(item, str) for item in raw_types):
            raise GoogleMapsUnavailableError()
        types = set(raw_types)
        category = next(
            (item for item in requested_categories if _CATEGORY_TYPES[item] in types),
            requested_categories[0],
        )
        try:
            place_id = str(place["id"])
            latitude = float(location["latitude"])
            longitude = float(location["longitude"])
        except (KeyError, TypeError, ValueError) as exc:
            raise GoogleMapsUnavailableError() from exc
        if (
            not math.isfinite(latitude)
            or not math.isfinite(longitude)
            or not -90 <= latitude <= 90
            or not -180 <= longitude <= 180
        ):
            raise GoogleMapsUnavailableError()
        point = ProviderPoint(latitude, longitude)

        display_name = place.get("displayName")
        if not isinstance(display_name, dict):
            return None
        name = display_name.get("text")
        if not isinstance(name, str):
            return None
        normalized_name = name.strip()
        if not normalized_name:
            return None
        return ProviderPlace(
            id=place_id,
            name=normalized_name,
            category=category,
            location=point,
        )

    @staticmethod
    def _decode_polyline(encoded: str) -> list[ProviderPoint]:
        points: list[ProviderPoint] = []
        index = latitude = longitude = 0
        while index < len(encoded):
            values: list[int] = []
            for _ in range(2):
                shift = result = 0
                while True:
                    if index >= len(encoded):
                        raise GoogleMapsUnavailableError()
                    value = ord(encoded[index]) - 63
                    index += 1
                    result |= (value & 0x1F) << shift
                    shift += 5
                    if value < 0x20:
                        break
                values.append(~(result >> 1) if result & 1 else result >> 1)
            latitude += values[0]
            longitude += values[1]
            points.append(ProviderPoint(latitude / 1e5, longitude / 1e5))
        return points

    @staticmethod
    def _places_key(origin: ProviderPoint, categories: tuple[str, ...], limit: int) -> str:
        return (
            f"places:{origin.latitude:.4f}:{origin.longitude:.4f}:"
            f"{','.join(sorted(categories))}:{limit}"
        )

    @staticmethod
    def _route_key(origin: ProviderPoint, destination: ProviderPoint) -> str:
        return (
            f"route:{origin.latitude:.5f}:{origin.longitude:.5f}:"
            f"{destination.latitude:.5f}:{destination.longitude:.5f}"
        )


def _endpoint(url: str) -> str:
    """ログ用にURLのパス部分だけを取り出す（クエリを落とし、値が紛れ込むのを防ぐ）。"""
    return url.split("?", 1)[0]


_MAX_LOGGED_MESSAGE_CHARS = 200


def _parse_google_error(response: httpx.Response) -> tuple[str | None, list[str], str | None]:
    """Google のエラー応答から `error.status` / `reason` の一覧 / `message` を取り出す。

    ログ用途なので、本文が JSON でない・想定の形をしていない場合も例外にせず空で返す。
    """
    try:
        body = response.json()
    except (json.JSONDecodeError, ValueError):
        return None, [], None
    if not isinstance(body, dict):
        return None, [], None
    error = body.get("error")
    if not isinstance(error, dict):
        return None, [], None

    status = error.get("status")
    message = error.get("message")
    reasons = [
        detail["reason"]
        for detail in error.get("details", [])
        if isinstance(detail, dict) and isinstance(detail.get("reason"), str)
    ]
    return (
        status if isinstance(status, str) else None,
        reasons,
        message[:_MAX_LOGGED_MESSAGE_CHARS] if isinstance(message, str) else None,
    )


def build_google_maps_provider(settings: Settings) -> GoogleMapsProvider:
    if settings.maps_mode == "fake":
        # ENV=local/test 以外では Settings のバリデーションで到達しない（config.py）。
        # キー有無より先に判定することで、fake を明示指定した実行でキーが設定されていても
        # 実 API を呼ばない（安全側に倒す）。
        logger.warning(
            "MAPS_MODE=fake: using FakeGoogleMapsProvider. "
            "No Google Maps request will be made and all candidates are synthetic."
        )
        return FakeGoogleMapsProvider()
    if not settings.google_maps_server_api_key:
        return UnconfiguredGoogleMapsProvider()
    return HttpGoogleMapsProvider(settings)
