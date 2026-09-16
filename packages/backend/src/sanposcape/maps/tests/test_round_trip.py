from time import monotonic

import pytest

from sanposcape.integrations.google_maps.fake import FakeGoogleMapsProvider
from sanposcape.integrations.google_maps.provider import ProviderPoint, ProviderRoute
from sanposcape.maps.round_trip import (
    PendingTrip,
    RoundTrip,
    RoundTripPlanner,
    SearchBudget,
    SearchExhausted,
    overlap,
)
from sanposcape.maps.schemas import GeoPoint, PlaceSearchRequest, RoundTripRouteRequest
from sanposcape.maps.service import MapsService

A = ProviderPoint(35, 139)
B = ProviderPoint(35.005, 139)


def budget(count=4):
    return SearchBudget(count, monotonic() + 10)


def test_reverse_and_different_point_density_are_same_road():
    path = (A, B)
    dense_reverse = (B, ProviderPoint(35.0025, 139), A)
    assert overlap(path, dense_reverse) == pytest.approx(1)
    assert overlap(dense_reverse, path) == pytest.approx(1)


def test_loop_totals_and_cache():
    provider = FakeGoogleMapsProvider()
    planner = RoundTripPlanner(provider)
    first = planner.prepare(A, B, 3600, budget())
    if isinstance(first, PendingTrip):
        first = planner.finish(first, budget(2))
    assert isinstance(first, RoundTrip)
    assert first.returning.path[0] == B
    assert first.returning.path[-1] == A
    assert overlap(first.returning.path, first.outbound.path) <= 0.5
    assert planner.prepare(A, B, 3600, budget(0)) == first
    with pytest.raises(SearchExhausted):
        planner.prepare(A, B, 600, budget(0))


def test_dead_end_never_becomes_a_loop_and_calls_are_bounded():
    class DeadEnd(FakeGoogleMapsProvider):
        calls = 0

        def get_walking_routes(self, origin, destination, **kwargs):
            self.calls += 1
            return (self.get_walking_route(origin, destination, timeout_seconds=1),)

    provider = DeadEnd()
    planner = RoundTripPlanner(provider)
    shared = budget()
    trip = planner.prepare(A, B, 3600, shared)
    assert isinstance(trip, PendingTrip)
    assert planner.finish(trip, shared) is None
    assert provider.calls == 4
    with pytest.raises(SearchExhausted):
        planner.prepare(A, B, 3600, shared)
    assert provider.calls == 4


def test_disconnected_or_over_budget_return_is_rejected():
    planner = RoundTripPlanner(FakeGoogleMapsProvider())
    outbound = ProviderRoute(500, 600, (A, B))
    pending = PendingTrip(A, B, 600, outbound)
    assert (
        planner.choose(pending, (ProviderRoute(500, 800, (B, ProviderPoint(35.003, 139.003), A)),))
        is None
    )
    pending.maximum_seconds = 3600
    assert (
        planner.choose(pending, (ProviderRoute(500, 800, (A, ProviderPoint(35.003, 139.003), B)),))
        is None
    )


def test_candidate_and_selected_route_share_actual_totals():
    service = MapsService(FakeGoogleMapsProvider(), 20, 20, 10, 8)
    request = PlaceSearchRequest(
        origin=GeoPoint(latitude=35, longitude=139),
        round_trip_duration_minutes=30,
        categories=["park"],
        route_mode="loop",
    )
    result = service.search_places(request)
    assert result.candidates
    for place in result.candidates:
        route = service.get_round_trip_route(
            RoundTripRouteRequest(
                origin=request.origin,
                destination={"place_id": place.id, "location": place.location},
                round_trip_duration_minutes=30,
            )
        )
        assert route.duration_seconds == place.round_trip_duration_seconds
        assert route.distance_meters == place.round_trip_distance_meters
        assert (
            route.duration_seconds
            == route.outbound.duration_seconds + route.return_route.duration_seconds
        )
        assert (
            route.distance_meters
            == route.outbound.distance_meters + route.return_route.distance_meters
        )


def test_search_reports_incomplete_when_budget_limits_candidate_evaluation():
    service = MapsService(FakeGoogleMapsProvider(), 20, 4, 10, 8)
    result = service.search_places(
        PlaceSearchRequest(
            origin=GeoPoint(latitude=35, longitude=139),
            round_trip_duration_minutes=30,
            categories=["park"],
            route_mode="loop",
        )
    )
    assert not result.search_complete


def test_geometry_checks_deadline_and_does_not_cache_expired_result(monkeypatch):
    import sanposcape.maps.round_trip as module

    ticks = iter(i * 0.01 for i in range(10000))
    monkeypatch.setattr(module, "monotonic", lambda: next(ticks))
    planner = RoundTripPlanner(FakeGoogleMapsProvider())
    outbound = ProviderRoute(500, 600, (A, B))
    returning = ProviderRoute(600, 800, (B, ProviderPoint(35.0025, 139.003), A))
    with pytest.raises(SearchExhausted):
        planner.choose(PendingTrip(A, B, 3600, outbound), (returning,), SearchBudget(1, 0.05))
    assert planner.cache.get(planner.key(A, B, 3600)) is None
