import json
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from sanposcape.config import Settings, get_settings
from sanposcape.dependencies import get_current_user_optional
from sanposcape.integrations.google_maps.provider import ProviderPoint, ProviderRoute
from sanposcape.main import app, create_app
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


def test_maps_endpoints_allow_requests_without_authorization_header(client: TestClient) -> None:
    app.dependency_overrides[get_maps_service] = lambda: MapsService(FakeProvider(), 20, 20, 10, 8)
    try:
        route_response = client.post("/explore/routes/walking", json=_payload())
        places_response = client.post(
            "/explore/places",
            json={
                "origin": {"latitude": 35, "longitude": 139},
                "round_trip_duration_minutes": 10,
                "categories": ["park"],
                "limit": 1,
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert route_response.status_code == 200
    assert places_response.status_code == 200


@pytest.mark.parametrize("authorization", ["Basic dXNlcjpwYXNz", "Bearer invalid-token"])
def test_maps_endpoints_reject_invalid_authorization_header(
    client: TestClient, authorization: str
) -> None:
    response = client.post(
        "/explore/routes/walking",
        json=_payload(),
        headers={"Authorization": authorization},
    )

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


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
    app.dependency_overrides[get_current_user_optional] = lambda: object()
    app.dependency_overrides[get_maps_service] = lambda: MapsService(FakeProvider(), 20, 20, 10, 8)
    try:
        response = client.post("/explore/routes/walking", json=_payload())
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()["destination"]["name"] == "Park"
    assert len(response.json()["path"]) == 2


def test_maps_validation_and_safe_upstream_errors(client: TestClient) -> None:
    app.dependency_overrides[get_current_user_optional] = lambda: object()
    app.dependency_overrides[get_maps_service] = lambda: MapsService(FakeProvider(), 20, 20, 10, 8)
    try:
        response = client.post("/explore/routes/walking", json={"origin": {}})
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 422

    app.dependency_overrides[get_current_user_optional] = lambda: object()
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

    app.dependency_overrides[get_current_user_optional] = lambda: object()
    app.dependency_overrides[get_maps_service] = lambda: (_ for _ in ()).throw(MapsQuotaError())
    try:
        quota = client.post("/explore/routes/walking", json=_payload())
    finally:
        app.dependency_overrides.clear()
    assert quota.status_code == 429
    assert quota.json() == {"detail": "Map provider quota exceeded"}

    app.dependency_overrides[get_current_user_optional] = lambda: object()
    app.dependency_overrides[get_maps_service] = lambda: (_ for _ in ()).throw(
        MapsUnavailableError()
    )
    try:
        unavailable = client.post("/explore/routes/walking", json=_payload())
    finally:
        app.dependency_overrides.clear()
    assert unavailable.status_code == 503
    assert unavailable.json() == {"detail": "Map provider unavailable"}


def test_explore_places_returns_candidates_when_maps_mode_is_fake() -> None:
    """SS-44: E2E で実際に通る経路（lifespan で fake provider を生成 → dependency →
    service → 200 応答）を通しで固定する。mobile が送るボディ（60分・全6カテゴリ・limit 20）
    を使う。"""
    settings = Settings(env="test", maps_mode="fake", auth_jwt_secret="x" * 32)
    fake_app = create_app(settings)
    fake_app.dependency_overrides[get_current_user_optional] = lambda: object()
    fake_app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(fake_app) as fake_client:
            response = fake_client.post(
                "/explore/places",
                json={
                    "origin": {"latitude": 35.6812, "longitude": 139.7671},
                    "round_trip_duration_minutes": 60,
                    "categories": [
                        "convenience_store",
                        "facility",
                        "park",
                        "retail",
                        "station",
                        "supermarket",
                    ],
                    "limit": 20,
                },
            )
    finally:
        fake_app.dependency_overrides.clear()

    assert response.status_code == 200
    candidates = response.json()["candidates"]
    assert len(candidates) >= 3
    for candidate in candidates:
        assert candidate["id"]
        assert candidate["name"]
        assert candidate["category"]
        assert isinstance(candidate["round_trip_duration_seconds"], int)


def test_openapi_declares_public_explore_endpoints_and_documented_error_responses() -> None:
    operation = app.openapi()["paths"]["/explore/routes/walking"]["post"]
    assert "security" not in operation
    assert {"401", "413", "422", "429", "503"} <= set(operation["responses"])
    assert "rate limit" in operation["responses"]["429"]["description"]


@pytest.mark.parametrize("file_name", ["openapi.json", "openapi.yaml"])
def test_committed_openapi_keeps_public_explore_contract(file_name: str) -> None:
    openapi_path = Path(__file__).parents[4] / file_name
    if openapi_path.suffix == ".json":
        document = json.loads(openapi_path.read_text())
    else:
        document = yaml.safe_load(openapi_path.read_text())

    expected_contract = {
        "/explore/places": ("search_explore_places", "PlaceSearchRequest", "PlaceSearchResponse"),
        "/explore/routes/walking": (
            "get_walking_route_explore_routes_walking",
            "WalkingRouteRequest",
            "WalkingRouteResponse",
        ),
    }
    for path, (operation_id, request_schema, response_schema) in expected_contract.items():
        operation = document["paths"][path]["post"]
        assert "security" not in operation
        assert operation["operationId"] == operation_id
        assert operation["requestBody"]["content"]["application/json"]["schema"] == {
            "$ref": f"#/components/schemas/{request_schema}"
        }
        assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {
            "$ref": f"#/components/schemas/{response_schema}"
        }


def test_openapi_declares_non_empty_japanese_preferred_place_names() -> None:
    name = app.openapi()["components"]["schemas"]["PlaceCandidate"]["properties"]["name"]

    assert name["type"] == "string"
    assert name["minLength"] == 1
    assert "Japanese-preferred" in name["description"]
    assert "falls back" in name["description"]
