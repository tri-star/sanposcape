import json
from typing import Any

import httpx

from sanposcape.config import Settings
from sanposcape.integrations.google_maps.cache import SingleFlight, TtlCache
from sanposcape.integrations.google_maps.exceptions import (
    GoogleMapsQuotaError,
    GoogleMapsUnavailableError,
)
from sanposcape.integrations.google_maps.provider import (
    GoogleMapsProvider,
    ProviderPlace,
    ProviderPoint,
    ProviderRoute,
)

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
            "maxResultCount": limit,
            "locationRestriction": {"circle": {"center": self._lat_lng(origin), "radius": 2000.0}},
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
        places = tuple(self._parse_place(place, categories) for place in response.get("places", []))
        self._places_cache.put(key, places)
        return places

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
            raise GoogleMapsUnavailableError() from exc
        except httpx.HTTPError as exc:
            raise GoogleMapsUnavailableError() from exc
        if response.status_code == 429:
            raise GoogleMapsQuotaError()
        if response.status_code >= 500:
            raise GoogleMapsUnavailableError()
        try:
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, json.JSONDecodeError, ValueError) as exc:
            raise GoogleMapsUnavailableError() from exc
        return body if isinstance(body, dict) else {}

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
    def _parse_place(place: object, requested_categories: tuple[str, ...]) -> ProviderPlace:
        if not isinstance(place, dict):
            raise GoogleMapsUnavailableError()
        location = place.get("location")
        name = place.get("displayName")
        if not isinstance(location, dict) or not isinstance(name, dict):
            raise GoogleMapsUnavailableError()
        types = set(place.get("types", []))
        category = next(
            (item for item in requested_categories if _CATEGORY_TYPES[item] in types),
            requested_categories[0],
        )
        try:
            return ProviderPlace(
                id=str(place["id"]),
                name=str(name["text"]),
                category=category,
                location=ProviderPoint(float(location["latitude"]), float(location["longitude"])),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise GoogleMapsUnavailableError() from exc

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


def build_google_maps_provider(settings: Settings) -> GoogleMapsProvider:
    if not settings.google_maps_server_api_key:
        return UnconfiguredGoogleMapsProvider()
    return HttpGoogleMapsProvider(settings)
