from time import monotonic

from sanposcape.integrations.google_maps.exceptions import (
    GoogleMapsQuotaError,
    GoogleMapsUnavailableError,
)
from sanposcape.integrations.google_maps.provider import GoogleMapsProvider, ProviderPoint
from sanposcape.maps.exceptions import (
    MapsQuotaError,
    MapsUnavailableError,
    RoundTripUnavailableError,
)
from sanposcape.maps.round_trip import (
    PendingTrip,
    RoundTrip,
    RoundTripPlanner,
    SearchBudget,
    SearchExhausted,
)
from sanposcape.maps.schemas import (
    GeoPoint,
    MapBounds,
    PlaceCandidate,
    PlaceSearchRequest,
    PlaceSearchResponse,
    RoundTripRouteRequest,
    RoundTripRouteResponse,
    RouteDestinationRead,
    WalkingRouteLeg,
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
        round_trip_planner: RoundTripPlanner | None = None,
    ) -> None:
        self._provider = provider
        self._round_trip_planner = round_trip_planner or RoundTripPlanner(provider)
        self._max_place_candidates = max_place_candidates
        self._max_route_requests = max_route_requests
        self._search_deadline_seconds = search_deadline_seconds
        self._route_timeout_seconds = route_timeout_seconds

    def search_places(self, request: PlaceSearchRequest) -> PlaceSearchResponse:
        if request.route_mode == "loop":
            return self._search_loops(request)
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

    def get_round_trip_route(self, request: RoundTripRouteRequest) -> RoundTripRouteResponse:
        budget = SearchBudget(4, monotonic() + self._search_deadline_seconds)
        origin, destination = (
            self._provider_point(request.origin),
            self._provider_point(request.destination.location),
        )
        try:
            trip = self._round_trip_planner.prepare(
                origin, destination, request.round_trip_duration_minutes * 60, budget
            )
            if isinstance(trip, PendingTrip):
                trip = self._round_trip_planner.finish(trip, budget)
        except GoogleMapsQuotaError as exc:
            raise MapsQuotaError() from exc
        except (GoogleMapsUnavailableError, SearchExhausted) as exc:
            raise MapsUnavailableError() from exc
        if trip is None:
            raise RoundTripUnavailableError()

        def leg(route):
            return WalkingRouteLeg(
                duration_seconds=route.duration_seconds,
                distance_meters=route.distance_meters,
                path=[self._geo_point(p) for p in route.path],
            )

        points = trip.outbound.path + trip.returning.path
        return RoundTripRouteResponse.model_validate(
            {
                "origin": request.origin,
                "destination": RouteDestinationRead(
                    **request.destination.model_dump(exclude={"name"}),
                    name=request.destination.name or request.destination.place_id,
                ),
                "outbound": leg(trip.outbound),
                "return": leg(trip.returning),
                "duration_seconds": trip.outbound.duration_seconds
                + trip.returning.duration_seconds,
                "distance_meters": trip.outbound.distance_meters + trip.returning.distance_meters,
                "bounds": MapBounds(
                    north_east=GeoPoint(
                        latitude=max(p.latitude for p in points),
                        longitude=max(p.longitude for p in points),
                    ),
                    south_west=GeoPoint(
                        latitude=min(p.latitude for p in points),
                        longitude=min(p.longitude for p in points),
                    ),
                ),
            }
        )

    def _search_loops(self, request: PlaceSearchRequest) -> PlaceSearchResponse:
        budget = SearchBudget(self._max_route_requests, monotonic() + self._search_deadline_seconds)
        origin = self._provider_point(request.origin)
        candidates: list[PlaceCandidate] = []
        pending = []
        complete = True

        def add(place, trip: RoundTrip):
            candidates.append(
                PlaceCandidate(
                    id=place.id,
                    name=place.name,
                    category=place.category,
                    location=self._geo_point(place.location),
                    round_trip_duration_seconds=trip.outbound.duration_seconds
                    + trip.returning.duration_seconds,
                    round_trip_distance_meters=trip.outbound.distance_meters
                    + trip.returning.distance_meters,
                )
            )

        try:
            places = self._provider.search_places(
                origin,
                tuple(sorted(c.value for c in request.categories)),
                min(request.limit, self._max_place_candidates),
                timeout_seconds=self._remaining_seconds(budget.deadline),
            )
            evaluated_places = places[: max(1, self._max_route_requests // 4)]
            complete = len(evaluated_places) == len(places)
            for place in evaluated_places:
                trip = self._round_trip_planner.prepare(
                    origin, place.location, request.round_trip_duration_minutes * 60, budget
                )
                if isinstance(trip, RoundTrip):
                    add(place, trip)
                elif isinstance(trip, PendingTrip):
                    pending.append((place, trip))
            for place, unfinished in pending:
                trip = self._round_trip_planner.finish(unfinished, budget)
                if trip is not None:
                    add(place, trip)
        except SearchExhausted:
            complete = False
        except GoogleMapsQuotaError as exc:
            raise MapsQuotaError() from exc
        except GoogleMapsUnavailableError as exc:
            raise MapsUnavailableError() from exc
        candidates.sort(key=lambda c: (c.round_trip_duration_seconds, c.round_trip_distance_meters))
        return PlaceSearchResponse(
            origin=request.origin,
            round_trip_duration_minutes=request.round_trip_duration_minutes,
            candidates=candidates[: request.limit],
            search_complete=complete,
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
