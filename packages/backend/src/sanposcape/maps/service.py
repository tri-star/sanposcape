from time import monotonic

from sanposcape.integrations.google_maps.exceptions import (
    GoogleMapsQuotaError,
    GoogleMapsUnavailableError,
)
from sanposcape.integrations.google_maps.provider import GoogleMapsProvider, ProviderPoint
from sanposcape.maps.exceptions import MapsQuotaError, MapsUnavailableError
from sanposcape.maps.schemas import (
    GeoPoint,
    MapBounds,
    PlaceCandidate,
    PlaceSearchRequest,
    PlaceSearchResponse,
    RouteDestinationRead,
    WalkingRouteRequest,
    WalkingRouteResponse,
)


class MapsService:
    def __init__(
        self,
        provider: GoogleMapsProvider,
        max_place_candidates: int,
        max_route_requests: int,
        search_deadline_seconds: float,
        route_timeout_seconds: float,
    ) -> None:
        self._provider = provider
        self._max_place_candidates = max_place_candidates
        self._max_route_requests = max_route_requests
        self._search_deadline_seconds = search_deadline_seconds
        self._route_timeout_seconds = route_timeout_seconds

    def search_places(self, request: PlaceSearchRequest) -> PlaceSearchResponse:
        origin = self._provider_point(request.origin)
        categories = tuple(sorted(category.value for category in request.categories))
        candidate_limit = min(request.limit, self._max_place_candidates, self._max_route_requests)
        deadline = monotonic() + self._search_deadline_seconds
        try:
            places = self._provider.search_places(
                origin,
                categories,
                candidate_limit,
                timeout_seconds=self._remaining_seconds(deadline),
            )
            candidates: list[PlaceCandidate] = []
            maximum_seconds = request.round_trip_duration_minutes * 60
            for place in places[:candidate_limit]:
                remaining_seconds = deadline - monotonic()
                if remaining_seconds <= 0:
                    break
                route = self._provider.get_walking_route(
                    origin, place.location, timeout_seconds=remaining_seconds
                )
                duration = route.duration_seconds * 2
                distance = route.distance_meters * 2
                if duration <= maximum_seconds:
                    candidates.append(
                        PlaceCandidate(
                            id=place.id,
                            name=place.name,
                            category=place.category,
                            location=self._geo_point(place.location),
                            round_trip_duration_seconds=duration,
                            round_trip_distance_meters=distance,
                        )
                    )
        except GoogleMapsQuotaError as exc:
            raise MapsQuotaError() from exc
        except GoogleMapsUnavailableError as exc:
            raise MapsUnavailableError() from exc
        candidates.sort(
            key=lambda candidate: (
                candidate.round_trip_duration_seconds,
                candidate.round_trip_distance_meters,
            )
        )
        return PlaceSearchResponse(
            origin=request.origin,
            round_trip_duration_minutes=request.round_trip_duration_minutes,
            candidates=candidates,
        )

    def get_walking_route(self, request: WalkingRouteRequest) -> WalkingRouteResponse:
        origin = self._provider_point(request.origin)
        destination = self._provider_point(request.destination.location)
        try:
            route = self._provider.get_walking_route(
                origin, destination, timeout_seconds=self._route_timeout_seconds
            )
        except GoogleMapsQuotaError as exc:
            raise MapsQuotaError() from exc
        except GoogleMapsUnavailableError as exc:
            raise MapsUnavailableError() from exc
        path = [self._geo_point(point) for point in route.path]
        return WalkingRouteResponse(
            origin=request.origin,
            # Place search remains the authoritative source of a display name. Routes does not
            # make a Place Details request merely to enrich this response.
            destination=RouteDestinationRead(
                place_id=request.destination.place_id,
                location=request.destination.location,
                name=request.destination.name or request.destination.place_id,
            ),
            duration_seconds=route.duration_seconds,
            distance_meters=route.distance_meters,
            path=path,
            bounds=MapBounds(
                north_east=GeoPoint(
                    latitude=max(point.latitude for point in path),
                    longitude=max(point.longitude for point in path),
                ),
                south_west=GeoPoint(
                    latitude=min(point.latitude for point in path),
                    longitude=min(point.longitude for point in path),
                ),
            ),
        )

    @staticmethod
    def _provider_point(point: GeoPoint) -> ProviderPoint:
        return ProviderPoint(latitude=point.latitude, longitude=point.longitude)

    @staticmethod
    def _geo_point(point: ProviderPoint) -> GeoPoint:
        return GeoPoint(latitude=point.latitude, longitude=point.longitude)

    @staticmethod
    def _remaining_seconds(deadline: float) -> float:
        remaining_seconds = deadline - monotonic()
        if remaining_seconds <= 0:
            raise GoogleMapsUnavailableError()
        return remaining_seconds
