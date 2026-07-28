from fastapi.testclient import TestClient

from sanposcape.dependencies import get_current_user
from sanposcape.integrations.google_maps.provider import ProviderPoint, ProviderRoute
from sanposcape.main import app
from sanposcape.maps.dependencies import get_maps_service
from sanposcape.maps.exceptions import MapsQuotaError, MapsUnavailableError
from sanposcape.maps.service import MapsService


class FakeProvider:
    def search_places(self, origin, categories, limit, **kwargs):
        return ()

    def get_walking_route(self, origin, destination, **kwargs):
        return ProviderRoute(120, 300, (ProviderPoint(35, 139), ProviderPoint(35.1, 139.1)))


def _payload() -> dict:
    return {
        "origin": {"latitude": 35, "longitude": 139},
        "destination": {
            "place_id": "opaque-id",
            "name": "Park",
            "location": {"latitude": 35.1, "longitude": 139.1},
        },
    }


def test_maps_endpoints_require_bearer_auth(client: TestClient) -> None:
    assert client.post("/explore/routes/walking", json=_payload()).status_code == 401


def test_explore_body_size_is_limited_before_auth_or_parsing(client: TestClient) -> None:
    response = client.post(
        "/explore/routes/walking",
        json={
            "origin": {"latitude": 35, "longitude": 139},
            "destination": {
                "place_id": "opaque-id",
                "name": "x" * 40_000,
                "location": {"latitude": 35.1, "longitude": 139.1},
            },
        },
    )
    assert response.status_code == 413


def test_walking_route_uses_normalized_response_contract(client: TestClient) -> None:
    app.dependency_overrides[get_current_user] = lambda: object()
    app.dependency_overrides[get_maps_service] = lambda: MapsService(FakeProvider(), 20, 20, 10, 8)
    try:
        response = client.post("/explore/routes/walking", json=_payload())
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()["destination"]["name"] == "Park"
    assert len(response.json()["path"]) == 2


def test_maps_validation_and_safe_upstream_errors(client: TestClient) -> None:
    app.dependency_overrides[get_current_user] = lambda: object()
    app.dependency_overrides[get_maps_service] = lambda: MapsService(FakeProvider(), 20, 20, 10, 8)
    try:
        response = client.post("/explore/routes/walking", json={"origin": {}})
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 422

    app.dependency_overrides[get_current_user] = lambda: object()
    app.dependency_overrides[get_maps_service] = lambda: MapsService(FakeProvider(), 20, 20, 10, 8)
    try:
        invalid_search = client.post(
            "/explore/places",
            json={
                "origin": {"latitude": 35, "longitude": 139},
                "round_trip_duration_minutes": 10,
                "categories": ["park", "park"],
                "limit": 21,
            },
        )
    finally:
        app.dependency_overrides.clear()
    assert invalid_search.status_code == 422

    app.dependency_overrides[get_current_user] = lambda: object()
    app.dependency_overrides[get_maps_service] = lambda: (_ for _ in ()).throw(MapsQuotaError())
    try:
        quota = client.post("/explore/routes/walking", json=_payload())
    finally:
        app.dependency_overrides.clear()
    assert quota.status_code == 429
    assert quota.json() == {"detail": "Map provider quota exceeded"}

    app.dependency_overrides[get_current_user] = lambda: object()
    app.dependency_overrides[get_maps_service] = lambda: (_ for _ in ()).throw(
        MapsUnavailableError()
    )
    try:
        unavailable = client.post("/explore/routes/walking", json=_payload())
    finally:
        app.dependency_overrides.clear()
    assert unavailable.status_code == 503
    assert unavailable.json() == {"detail": "Map provider unavailable"}


def test_openapi_declares_security_and_documented_error_responses() -> None:
    operation = app.openapi()["paths"]["/explore/routes/walking"]["post"]
    assert operation["security"] == [{"HTTPBearer": []}]
    assert {"401", "413", "422", "429", "503"} <= set(operation["responses"])
    assert "rate limit" in operation["responses"]["429"]["description"]
