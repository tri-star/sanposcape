import pytest

from sanposcape.integrations.google_maps.exceptions import (
    GoogleMapsQuotaError,
    GoogleMapsUnavailableError,
)
from sanposcape.integrations.google_maps.provider import ProviderPlace, ProviderPoint, ProviderRoute
from sanposcape.maps.exceptions import MapsQuotaError, MapsUnavailableError
from sanposcape.maps.schemas import PlaceSearchRequest, WalkingRouteRequest
from sanposcape.maps.service import MapsService


class FakeProvider:
    def __init__(self) -> None:
        self.places = (
            ProviderPlace("far", "Far", "park", ProviderPoint(35.1, 139.1)),
            ProviderPlace("near", "Near", "park", ProviderPoint(35.2, 139.2)),
        )
        self.routes = {
            (35.1, 139.1): ProviderRoute(
                400, 500, (ProviderPoint(35, 139), ProviderPoint(35.1, 139.1))
            ),
            (35.2, 139.2): ProviderRoute(
                200, 200, (ProviderPoint(35, 139), ProviderPoint(35.2, 139.2))
            ),
        }

    def search_places(self, origin, categories, limit, **kwargs):
        return self.places[:limit]

    def get_walking_route(self, origin, destination, **kwargs):
        return self.routes[(destination.latitude, destination.longitude)]


def test_search_filters_and_sorts_by_round_trip_then_distance() -> None:
    service = MapsService(FakeProvider(), 20, 20, 10, 8)
    result = service.search_places(
        PlaceSearchRequest.model_validate(
            {
                "origin": {"latitude": 35, "longitude": 139},
                "round_trip_duration_minutes": 10,
                "categories": ["park"],
            }
        )
    )
    assert [candidate.id for candidate in result.candidates] == ["near"]
    assert result.candidates[0].round_trip_duration_seconds == 400


def test_route_returns_map_ready_path_bounds_and_destination_name() -> None:
    service = MapsService(FakeProvider(), 20, 20, 10, 8)
    result = service.get_walking_route(
        WalkingRouteRequest.model_validate(
            {
                "origin": {"latitude": 35, "longitude": 139},
                "destination": {
                    "place_id": "near",
                    "name": "Near",
                    "location": {"latitude": 35.2, "longitude": 139.2},
                },
            }
        )
    )
    assert result.destination.name == "Near"
    assert len(result.path) == 2
    assert result.bounds.north_east == result.path[-1]


def test_search_stops_route_fan_out_when_end_to_end_deadline_expires(monkeypatch) -> None:
    provider = FakeProvider()
    service = MapsService(provider, 20, 20, 10, 8)
    times = iter((0.0, 0.0, 0.0, 11.0))
    monkeypatch.setattr("sanposcape.maps.service.monotonic", lambda: next(times))

    result = service.search_places(
        PlaceSearchRequest.model_validate(
            {
                "origin": {"latitude": 35, "longitude": 139},
                "round_trip_duration_minutes": 20,
                "categories": ["park"],
            }
        )
    )

    assert [candidate.id for candidate in result.candidates] == ["far"]


@pytest.mark.parametrize(
    "error, expected",
    [
        (GoogleMapsQuotaError(), MapsQuotaError),
        (GoogleMapsUnavailableError(), MapsUnavailableError),
    ],
)
def test_provider_failures_are_mapped(error, expected) -> None:
    class ErrorProvider(FakeProvider):
        def search_places(self, origin, categories, limit, **kwargs):
            raise error

    service = MapsService(ErrorProvider(), 20, 20, 10, 8)
    with pytest.raises(expected):
        service.search_places(
            PlaceSearchRequest.model_validate(
                {
                    "origin": {"latitude": 35, "longitude": 139},
                    "round_trip_duration_minutes": 10,
                    "categories": ["park"],
                }
            )
        )
