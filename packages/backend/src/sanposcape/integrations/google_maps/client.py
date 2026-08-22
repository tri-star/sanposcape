import json
import logging
import math
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
    ProviderIntermediate,
    ProviderPlace,
    ProviderPoint,
    ProviderRoute,
    ProviderRouteLeg,
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

# SS-33: FieldMask はリクエストの形で切り替える(決定3)。intermediates 無し(従来の片道・
# 探索の候補ごとの呼び出し)は routes.polyline を取り、legs は取らない(探索の最大20回の
# 呼び出しで同じ折れ線を二重に受け取らないため)。intermediates あり(周回)は逆に
# routes.polyline を落とし legs.* だけを取る(全体 path は legs の連結で構築する)。
_ROUTE_FIELD_MASK_WITHOUT_INTERMEDIATES = (
    "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline"
)
_ROUTE_FIELD_MASK_WITH_INTERMEDIATES = (
    "routes.duration,routes.distanceMeters,"
    "routes.legs.duration,routes.legs.distanceMeters,routes.legs.polyline.encodedPolyline"
)
# routes.duration(スカラー) と Σlegs.duration の差がこれを超えたら異常としてログに残す
# (応答自体は Σlegs を採用する。決定3)。
_ROUTE_DURATION_DISCREPANCY_WARNING_SECONDS = 5


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
        self,
        origin: ProviderPoint,
        destination: ProviderPoint,
        *,
        timeout_seconds: float,
        intermediates: tuple[ProviderIntermediate, ...] = (),
    ) -> ProviderRoute:
        raise GoogleMapsUnavailableError()


class HttpGoogleMapsProvider:
    def __init__(self, settings: Settings, client: httpx.Client | None = None) -> None:
        self._key = settings.google_maps_server_api_key
        self._client = client or httpx.Client(
            timeout=httpx.Timeout(
                settings.google_maps_read_timeout_seconds,
                connect=settings.google_maps_connect_timeout_seconds,
            )
        )
        self._owns_client = client is None
        self._places_cache: TtlCache[tuple[ProviderPlace, ...]] = TtlCache(
            settings.google_maps_cache_ttl_seconds, settings.google_maps_cache_max_entries
        )
        self._routes_cache: TtlCache[ProviderRoute] = TtlCache(
            settings.google_maps_cache_ttl_seconds, settings.google_maps_cache_max_entries
        )
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
        return self._places_flight.do(
            key, lambda: self._load_places(key, origin, categories, limit, timeout_seconds)
        )

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
        self,
        origin: ProviderPoint,
        destination: ProviderPoint,
        *,
        timeout_seconds: float,
        intermediates: tuple[ProviderIntermediate, ...] = (),
    ) -> ProviderRoute:
        key = self._route_key(origin, destination, intermediates)
        cached = self._routes_cache.get(key)
        if cached is not None:
            return cached
        return self._routes_flight.do(
            key,
            lambda: self._load_route(key, origin, destination, timeout_seconds, intermediates),
        )

    def _load_route(
        self,
        key: str,
        origin: ProviderPoint,
        destination: ProviderPoint,
        timeout_seconds: float,
        intermediates: tuple[ProviderIntermediate, ...],
    ) -> ProviderRoute:
        cached = self._routes_cache.get(key)
        if cached is not None:
            return cached
        payload: dict[str, Any] = {
            "origin": {"location": {"latLng": self._lat_lng(origin)}},
            "destination": {"location": {"latLng": self._lat_lng(destination)}},
            "travelMode": "WALK",
        }
        if intermediates:
            # stopover(via=False) には "via" を付けない。Routes API は via:true の
            # ときだけ leg を分割しない(backend-plan.md 決定2/Step4)。
            payload["intermediates"] = [
                {
                    "location": {"latLng": self._lat_lng(item.point)},
                    **({"via": True} if item.via else {}),
                }
                for item in intermediates
            ]
        response = self._request(
            "POST",
            f"{_ROUTES_BASE_URL}:computeRoutes",
            json=payload,
            headers={
                "X-Goog-FieldMask": (
                    _ROUTE_FIELD_MASK_WITH_INTERMEDIATES
                    if intermediates
                    else _ROUTE_FIELD_MASK_WITHOUT_INTERMEDIATES
                )
            },
            timeout_seconds=timeout_seconds,
        )
        routes = response.get("routes", [])
        if not routes:
            raise GoogleMapsUnavailableError()
        route = routes[0]
        result = (
            self._parse_route_with_legs(route)
            if intermediates
            else self._parse_route_without_legs(route)
        )
        # origin と destination がほぼ同一地点だと、Google は「1点だけのポリライン」
        # ("duration": "0s"、"distanceMeters" キー自体が欠落)を 200 で返してくることが
        # ある(例: 探索の起点の目の前にある駅がそのまま候補地点になったケース)。
        # `WalkingRouteResponse.path` / `WalkingRouteLeg.path` はどちらも
        # `min_length=2` を契約にしているため、ここで弾いておかないと下流の
        # response モデル構築でバリデーションエラーになる。呼び出し元
        # (`maps/service.py`)は `GoogleMapsUnavailableError` を「この経路は使えない」
        # として扱い、候補ごとにスキップするか 503 にマップする。
        if len(result.path) < 2:
            raise GoogleMapsUnavailableError()
        self._routes_cache.put(key, result)
        return result

    def _parse_route_without_legs(self, route: dict[str, Any]) -> ProviderRoute:
        return ProviderRoute(
            duration_seconds=self._duration_seconds(route.get("duration")),
            distance_meters=int(route.get("distanceMeters", 0)),
            path=tuple(self._decode_polyline(route.get("polyline", {}).get("encodedPolyline", ""))),
        )

    def _parse_route_with_legs(self, route: dict[str, Any]) -> ProviderRoute:
        """SS-33: `intermediates` ありの応答から往路/復路の2 legをパースする。

        2点未満の leg があれば、その leg 以降を欠けたものとして扱う(`legs` の一貫性を
        壊さないため)。**例外は投げない**: 決定6のフォールバックのために「復路 leg は
        壊れているが往路は使える」応答も service に届ける必要がある。outbound(legs[0])
        自体が壊れている(または legs が丸ごと無い)場合のみ、全体として使い物にならない
        ので `_load_route` 側の `len(result.path) < 2` チェックで従来どおり
        `GoogleMapsUnavailableError` になる。
        """
        legs_data = route.get("legs", [])
        legs: list[ProviderRouteLeg] = []
        if len(legs_data) >= 1:
            outbound_path = tuple(self._decode_leg_polyline(legs_data[0]))
            if len(outbound_path) >= 2:
                legs.append(self._route_leg(legs_data[0], outbound_path))
                if len(legs_data) >= 2:
                    inbound_path = tuple(self._decode_leg_polyline(legs_data[1]))
                    if len(inbound_path) >= 2:
                        legs.append(self._route_leg(legs_data[1], inbound_path))

        if len(legs) == 2:
            path = legs[0].path + legs[1].path[1:]
        elif len(legs) == 1:
            path = legs[0].path
        else:
            path = ()

        top_duration = self._duration_seconds(route.get("duration"))
        if len(legs) == 2:
            leg_duration_sum = legs[0].duration_seconds + legs[1].duration_seconds
            if abs(top_duration - leg_duration_sum) > _ROUTE_DURATION_DISCREPANCY_WARNING_SECONDS:
                logger.warning(
                    "SS-33: routes.duration(%ss) diverges from Σlegs.duration(%ss) by >%ss",
                    top_duration,
                    leg_duration_sum,
                    _ROUTE_DURATION_DISCREPANCY_WARNING_SECONDS,
                )

        return ProviderRoute(
            duration_seconds=top_duration,
            distance_meters=int(route.get("distanceMeters", 0)),
            path=path,
            legs=tuple(legs),
        )

    def _route_leg(self, leg: dict[str, Any], path: tuple[ProviderPoint, ...]) -> ProviderRouteLeg:
        return ProviderRouteLeg(
            duration_seconds=self._duration_seconds(leg.get("duration")),
            distance_meters=int(leg.get("distanceMeters", 0)),
            path=path,
        )

    def _decode_leg_polyline(self, leg: dict[str, Any]) -> list[ProviderPoint]:
        return self._decode_polyline(leg.get("polyline", {}).get("encodedPolyline", ""))

    def _request(self, method: str, url: str, **kwargs: Any) -> dict[str, Any]:
        timeout_seconds = kwargs.pop("timeout_seconds")
        try:
            response = self._client.request(
                method,
                url,
                headers={"X-Goog-Api-Key": self._key, **kwargs.pop("headers", {})},
                timeout=timeout_seconds,
                **kwargs,
            )
        except httpx.TimeoutException as exc:
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
        if self._owns_client:
            self._client.close()

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
    def _route_key(
        origin: ProviderPoint,
        destination: ProviderPoint,
        intermediates: tuple[ProviderIntermediate, ...] = (),
    ) -> str:
        # SS-33 決定7: intermediates が空(one_way)のときは従来と完全に同一のキーになるよう、
        # サフィックスを一切追加しない(探索が温めたキャッシュをそのまま共有できるため)。
        base = (
            f"route:{origin.latitude:.5f}:{origin.longitude:.5f}:"
            f"{destination.latitude:.5f}:{destination.longitude:.5f}"
        )
        suffix = "".join(
            f":{'v' if item.via else 's'}{item.point.latitude:.5f},{item.point.longitude:.5f}"
            for item in intermediates
        )
        return base + suffix


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
