import json
import logging
import math
from typing import Any

import httpx

from sanposcape.config import Settings
from sanposcape.integrations.google_maps.address import (
    ADDRESS_MAX_CHARS,
    normalize_address,
    parse_geocode_results,
)
from sanposcape.integrations.google_maps.cache import SingleFlight, TtlCache
from sanposcape.integrations.google_maps.exceptions import (
    GoogleMapsQuotaError,
    GoogleMapsUnavailableError,
)
from sanposcape.integrations.google_maps.fake import FakeGoogleMapsProvider
from sanposcape.integrations.google_maps.provider import (
    GoogleMapsProvider,
    ProviderAddress,
    ProviderCircle,
    ProviderLoopRoute,
    ProviderPlace,
    ProviderPoint,
    ProviderRectangle,
    ProviderRoute,
    ProviderTextPlace,
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
_LOOP_ROUTE_FIELD_MASK = (
    "routes.legs.duration,routes.legs.distanceMeters,routes.legs.polyline.encodedPolyline"
)
# 逆ジオコーディングは Geocoding API v4（2026-03 GA。SS-138）。キーは他の API と同じく
# ヘッダーで送る。
# 座標はクエリ（`locationQuery`）で送る（パスの形 `/location/{lat},{lng}` にすると、クエリを落とす
# `_endpoint()` と `core/tracing.py` でも座標が残るため）。
# 文字列での場所の検索（Text Search (New)。SS-267）。
# 名前・住所・位置を取るので Text Search Pro の SKU。
_TEXT_SEARCH_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location"
_GEOCODING_URL = "https://geocode.googleapis.com/v4/geocode/location"
_GEOCODING_FIELD_MASK = (
    "results.formattedAddress,results.addressComponents,results.types,results.bounds"
)


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

    def get_walking_loop_route(
        self,
        origin: ProviderPoint,
        destination: ProviderPoint,
        via: ProviderPoint,
        *,
        timeout_seconds: float,
    ) -> ProviderLoopRoute:
        raise GoogleMapsUnavailableError()

    def search_text(
        self,
        query: str,
        *,
        restriction: ProviderRectangle | None,
        bias: ProviderCircle | None,
        limit: int,
        timeout_seconds: float,
    ) -> tuple[ProviderTextPlace, ...]:
        raise GoogleMapsUnavailableError()

    def reverse_geocode(
        self, point: ProviderPoint, *, cache_scope: str, timeout_seconds: float
    ) -> ProviderAddress | None:
        raise GoogleMapsUnavailableError()


class HttpGoogleMapsProvider:
    def __init__(self, settings: Settings, client: httpx.Client | None = None) -> None:
        self._key = settings.google_maps_server_api_key
        self._connect_timeout_seconds = settings.google_maps_connect_timeout_seconds
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
        # 周回ルートは往路単体（`route:`）とキーの名前空間を分ける（決定4）。
        self._loop_cache: TtlCache[ProviderLoopRoute] = TtlCache(
            settings.google_maps_cache_ttl_seconds, settings.google_maps_cache_max_entries
        )
        # 「住所なし」もキャッシュしたいので、0 または 1 要素のタプルで持つ
        # （`get` の None は未登録の意味）。
        self._geocode_cache: TtlCache[tuple[ProviderAddress, ...]] = TtlCache(
            settings.google_maps_cache_ttl_seconds, settings.google_maps_cache_max_entries
        )
        # 検索語はメモリのキャッシュのキーにだけ入る（DB・ログには残さない。SS-267）。
        self._text_cache: TtlCache[tuple[ProviderTextPlace, ...]] = TtlCache(
            settings.google_maps_cache_ttl_seconds, settings.google_maps_cache_max_entries
        )
        self._places_flight: SingleFlight[tuple[ProviderPlace, ...]] = SingleFlight()
        self._text_flight: SingleFlight[tuple[ProviderTextPlace, ...]] = SingleFlight()
        self._routes_flight: SingleFlight[ProviderRoute] = SingleFlight()
        self._loop_flight: SingleFlight[ProviderLoopRoute] = SingleFlight()
        self._geocode_flight: SingleFlight[tuple[ProviderAddress, ...]] = SingleFlight()

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

    def get_walking_loop_route(
        self,
        origin: ProviderPoint,
        destination: ProviderPoint,
        via: ProviderPoint,
        *,
        timeout_seconds: float,
    ) -> ProviderLoopRoute:
        key = self._loop_key(origin, destination, via)
        cached = self._loop_cache.get(key)
        if cached is not None:
            return cached
        return self._loop_flight.do(
            key,
            lambda: self._load_loop_route(key, origin, destination, via, timeout_seconds),
        )

    def _load_loop_route(
        self,
        key: str,
        origin: ProviderPoint,
        destination: ProviderPoint,
        via: ProviderPoint,
        timeout_seconds: float,
    ) -> ProviderLoopRoute:
        cached = self._loop_cache.get(key)
        if cached is not None:
            return cached
        response = self._request(
            "POST",
            f"{_ROUTES_BASE_URL}:computeRoutes",
            json={
                "origin": {"location": {"latLng": self._lat_lng(origin)}},
                "destination": {"location": {"latLng": self._lat_lng(origin)}},
                "intermediates": [
                    {"location": {"latLng": self._lat_lng(destination)}},
                    {"location": {"latLng": self._lat_lng(via)}, "via": True},
                ],
                "travelMode": "WALK",
            },
            headers={"X-Goog-FieldMask": _LOOP_ROUTE_FIELD_MASK},
            timeout_seconds=timeout_seconds,
        )
        routes = response.get("routes", [])
        if not routes:
            raise GoogleMapsUnavailableError()
        legs = routes[0].get("legs")
        if not isinstance(legs, list) or len(legs) != 2:
            # 経由点を stopover ではなく via（通過点）にしているので、正常時は必ず
            # destination までの leg と origin まで戻る leg の 2 つになる。
            raise GoogleMapsUnavailableError()
        result = ProviderLoopRoute(
            outbound=self._parse_loop_leg(legs[0]),
            inbound=self._parse_loop_leg(legs[1]),
        )
        self._loop_cache.put(key, result)
        return result

    def search_text(
        self,
        query: str,
        *,
        restriction: ProviderRectangle | None,
        bias: ProviderCircle | None,
        limit: int,
        timeout_seconds: float,
    ) -> tuple[ProviderTextPlace, ...]:
        key = self._text_key(query, restriction, bias, limit)
        cached = self._text_cache.get(key)
        if cached is not None:
            return cached
        return self._text_flight.do(
            key,
            lambda: self._load_text(key, query, restriction, bias, limit, timeout_seconds),
        )

    def _load_text(
        self,
        key: str,
        query: str,
        restriction: ProviderRectangle | None,
        bias: ProviderCircle | None,
        limit: int,
        timeout_seconds: float,
    ) -> tuple[ProviderTextPlace, ...]:
        cached = self._text_cache.get(key)
        if cached is not None:
            return cached
        payload: dict[str, Any] = {
            "textQuery": query,
            "languageCode": "ja",
            "regionCode": "JP",
            "pageSize": limit,
        }
        if restriction is not None:
            payload["locationRestriction"] = {
                "rectangle": {
                    "low": self._lat_lng(restriction.south_west),
                    "high": self._lat_lng(restriction.north_east),
                }
            }
        if bias is not None:
            payload["locationBias"] = {
                "circle": {"center": self._lat_lng(bias.center), "radius": bias.radius_meters}
            }
        # 検索語は POST の本文で送る（URL・ログ・トレースに載せない）。
        response = self._request(
            "POST",
            f"{_PLACES_BASE_URL}/places:searchText",
            json=payload,
            headers={"X-Goog-FieldMask": _TEXT_SEARCH_FIELD_MASK},
            timeout_seconds=timeout_seconds,
        )
        raw_places = response.get("places", [])
        if not isinstance(raw_places, list):
            raise GoogleMapsUnavailableError()
        places = [
            parsed for place in raw_places if (parsed := _parse_text_place(place)) is not None
        ]
        result = tuple(places[:limit])
        self._text_cache.put(key, result)
        return result

    def reverse_geocode(
        self, point: ProviderPoint, *, cache_scope: str, timeout_seconds: float
    ) -> ProviderAddress | None:
        key = self._geocode_key(cache_scope, point)
        cached = self._geocode_cache.get(key)
        if cached is None:
            cached = self._geocode_flight.do(
                key, lambda: self._load_geocode(key, point, timeout_seconds)
            )
        return cached[0] if cached else None

    def _load_geocode(
        self, key: str, point: ProviderPoint, timeout_seconds: float
    ) -> tuple[ProviderAddress, ...]:
        cached = self._geocode_cache.get(key)
        if cached is not None:
            return cached
        # 失敗は他の API と同じく HTTP のステータスと `error` 本文で返る（`_request` が扱う）。
        # 住所の無い場所（海上など）は、住所の無い結果か空の `results` が返る。
        response = self._request(
            "GET",
            _GEOCODING_URL,
            params={
                "locationQuery": f"{point.latitude},{point.longitude}",
                "languageCode": "ja",
                "regionCode": "JP",
            },
            headers={"X-Goog-FieldMask": _GEOCODING_FIELD_MASK},
            timeout_seconds=timeout_seconds,
        )
        address = parse_geocode_results(response.get("results", []), point)
        result: tuple[ProviderAddress, ...] = () if address is None else (address,)
        self._geocode_cache.put(key, result)
        return result

    def _request(self, method: str, url: str, **kwargs: Any) -> dict[str, Any]:
        timeout_seconds = kwargs.pop("timeout_seconds")
        # ★ 単一の float を httpx に渡すと、それが connect/read/write/pool の全フェーズに
        # 適用され、クライアント既定の `connect_timeout_seconds` が実質上書きされてしまう
        # （`route_deadline_seconds` は最大25秒まで許容するため、接続詰まり時に本来より
        # 大幅に長く待ってしまう）。connect フェーズだけは短いままにする。
        timeout = httpx.Timeout(
            timeout_seconds, connect=min(self._connect_timeout_seconds, timeout_seconds)
        )
        try:
            response = self._client.request(
                method,
                url,
                headers={"X-Goog-Api-Key": self._key, **kwargs.pop("headers", {})},
                timeout=timeout,
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
        except (httpx.HTTPError, json.JSONDecodeError, ValueError):
            self._log_error_response(method, url, response)
            # 連鎖を切る: `raise_for_status()` の HTTPStatusError はメッセージにクエリ込みの URL を
            # 持ち、Geocoding API では座標が入る（SS-138）。要点は上でログに残している。
            raise GoogleMapsUnavailableError() from None
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
    def _parse_loop_leg(leg: object) -> ProviderRoute:
        if not isinstance(leg, dict):
            raise GoogleMapsUnavailableError()
        result = ProviderRoute(
            duration_seconds=HttpGoogleMapsProvider._duration_seconds(leg.get("duration")),
            distance_meters=int(leg.get("distanceMeters", 0)),
            path=tuple(
                HttpGoogleMapsProvider._decode_polyline(
                    leg.get("polyline", {}).get("encodedPolyline", "")
                )
            ),
        )
        if len(result.path) < 2:
            raise GoogleMapsUnavailableError()
        return result

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

    @staticmethod
    def _text_key(
        query: str,
        restriction: ProviderRectangle | None,
        bias: ProviderCircle | None,
        limit: int,
    ) -> str:
        area = "none"
        if restriction is not None:
            sw, ne = restriction.south_west, restriction.north_east
            area = f"rect:{sw.latitude:.4f}:{sw.longitude:.4f}:{ne.latitude:.4f}:{ne.longitude:.4f}"
        elif bias is not None:
            area = (
                f"bias:{bias.center.latitude:.4f}:{bias.center.longitude:.4f}:"
                f"{bias.radius_meters:.0f}"
            )
        # 検索語は区切り文字を含みうるので最後に置く。
        return f"text:{area}:{limit}:{query}"

    @staticmethod
    def _geocode_key(cache_scope: str, point: ProviderPoint) -> str:
        # 住所のキャッシュは利用者ごとに分け、他の利用者に使い回さない（Geocoding API の
        # 利用規約。SS-212 / ADR-001）。
        return f"geocode:{cache_scope}:{point.latitude:.5f}:{point.longitude:.5f}"

    @staticmethod
    def _loop_key(origin: ProviderPoint, destination: ProviderPoint, via: ProviderPoint) -> str:
        """片道の `route:` とは名前空間を分ける（決定4）。"""
        return (
            f"loop:{origin.latitude:.5f}:{origin.longitude:.5f}:"
            f"{destination.latitude:.5f}:{destination.longitude:.5f}:"
            f"via:{via.latitude:.5f}:{via.longitude:.5f}"
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


def _parse_text_place(place: object) -> ProviderTextPlace | None:
    """Text Search の1件を読む。位置・ID が壊れていれば応答全体を失敗にし（Nearby Search と同じ）、
    表示名が空なら読み飛ばす。住所は取れないときだけ None。
    """
    if not isinstance(place, dict):
        raise GoogleMapsUnavailableError()
    location = place.get("location")
    if not isinstance(location, dict):
        raise GoogleMapsUnavailableError()
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
    display_name = place.get("displayName")
    name = display_name.get("text") if isinstance(display_name, dict) else None
    if not isinstance(name, str) or not name.strip():
        return None
    formatted = place.get("formattedAddress")
    address = normalize_address(formatted) if isinstance(formatted, str) else ""
    return ProviderTextPlace(
        id=place_id,
        name=name.strip()[:ADDRESS_MAX_CHARS],
        address=address[:ADDRESS_MAX_CHARS] or None,
        location=ProviderPoint(latitude, longitude),
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
