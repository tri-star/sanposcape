import httpx
import pytest

from sanposcape.config import Settings
from sanposcape.integrations.google_maps.client import HttpGoogleMapsProvider
from sanposcape.integrations.google_maps.exceptions import (
    GoogleMapsQuotaError,
    GoogleMapsUnavailableError,
)
from sanposcape.integrations.google_maps.provider import ProviderPoint


def _provider(handler):
    transport = httpx.MockTransport(handler)
    return HttpGoogleMapsProvider(
        Settings(google_maps_server_api_key="server-key"), client=httpx.Client(transport=transport)
    )


def test_search_normalizes_places_and_caches_successes() -> None:
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        assert request.headers["x-goog-api-key"] == "server-key"
        assert (
            request.headers["x-goog-fieldmask"]
            == "places.id,places.displayName,places.location,places.types"
        )
        return httpx.Response(
            200,
            json={
                "places": [
                    {
                        "id": "opaque",
                        "displayName": {"text": "Park"},
                        "location": {"latitude": 35, "longitude": 139},
                        "types": ["park"],
                    }
                ]
            },
        )

    provider = _provider(handler)
    origin = ProviderPoint(35, 139)
    first = provider.search_places(origin, ("park",), 20, timeout_seconds=2)
    second = provider.search_places(origin, ("park",), 20, timeout_seconds=2)
    assert first == second
    assert first[0].category == "park"
    assert calls == 1


def test_route_decodes_polyline() -> None:
    provider = _provider(
        lambda request: httpx.Response(
            200,
            json={
                "routes": [
                    {
                        "duration": "123.4s",
                        "distanceMeters": 456,
                        "polyline": {"encodedPolyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@"},
                    }
                ]
            },
        )
    )
    route = provider.get_walking_route(
        ProviderPoint(38.5, -120.2), ProviderPoint(43.252, -126.453), timeout_seconds=2
    )
    assert route.duration_seconds == 123
    assert len(route.path) == 3


@pytest.mark.parametrize(
    "status, exception",
    [
        (429, GoogleMapsQuotaError),
        (403, GoogleMapsUnavailableError),
        (503, GoogleMapsUnavailableError),
    ],
)
def test_upstream_errors_are_sanitized(status, exception) -> None:
    provider = _provider(lambda request: httpx.Response(status, json={"sensitive": "not exposed"}))
    with pytest.raises(exception):
        provider.search_places(ProviderPoint(35, 139), ("park",), 20, timeout_seconds=2)
