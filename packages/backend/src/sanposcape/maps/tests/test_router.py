from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from sanposcape.config import Settings, get_settings
from sanposcape.dependencies import get_current_user_optional
from sanposcape.integrations.google_maps.provider import (
    ProviderPoint,
    ProviderRoute,
    ProviderRouteLeg,
)
from sanposcape.main import app, create_app
from sanposcape.maps.dependencies import get_maps_service
from sanposcape.maps.exceptions import MapsQuotaError, MapsUnavailableError
from sanposcape.maps.service import MapsService


class FakeProvider:
    """SS-33: `intermediates` には未対応(常に単一の片道を返す)。

    router 層のテストは主に auth/バリデーション/エラーマッピングの配線を見るもので、
    周回の中身(legs の採否等)は `maps/tests/test_service.py` が担当するため、
    ここでは `_payload()` が既定で `route_type=one_way` を送ることで単純化する。
    周回特有のレスポンス形(legs / return_is_same_path)を見るテストは `LoopFakeProvider`
    を使う。
    """

    def search_places(self, origin, categories, limit, **kwargs):
        return ()

    def get_walking_route(self, origin, destination, **kwargs):
        return ProviderRoute(120, 300, (ProviderPoint(35, 139), ProviderPoint(35.1, 139.1)))


class LoopFakeProvider:
    """`intermediates` があれば、品質基準を満たす決定的な2 leg を返す(常に採用される)。"""

    def search_places(self, origin, categories, limit, **kwargs):
        return ()

    def get_walking_route(self, origin, destination, **kwargs):
        intermediates = kwargs.get("intermediates", ())
        if not intermediates:
            return ProviderRoute(120, 300, (ProviderPoint(35, 139), ProviderPoint(35.1, 139.1)))
        outbound = ProviderRouteLeg(
            duration_seconds=300,
            distance_meters=400,
            path=(ProviderPoint(35.0, 139.0), ProviderPoint(35.01, 139.0)),
        )
        inbound = ProviderRouteLeg(
            duration_seconds=300,
            distance_meters=400,
            path=(ProviderPoint(35.0, 139.0), ProviderPoint(35.0, 139.02)),
        )
        return ProviderRoute(
            duration_seconds=outbound.duration_seconds + inbound.duration_seconds,
            distance_meters=outbound.distance_meters + inbound.distance_meters,
            path=outbound.path + inbound.path[1:],
            legs=(outbound, inbound),
        )


def _payload(route_type: str = "one_way") -> dict:
    return {
        "origin": {"latitude": 35, "longitude": 139},
        "destination": {
            "place_id": "opaque-id",
            "name": "Park",
            "location": {"latitude": 35.1, "longitude": 139.1},
        },
        "route_type": route_type,
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
    assert response.json()["route_type"] == "one_way"
    assert response.json()["legs"] == []
    assert response.json()["return_is_same_path"] is False


def test_walking_route_loop_response_includes_legs_and_return_is_same_path(
    client: TestClient,
) -> None:
    app.dependency_overrides[get_current_user_optional] = lambda: object()
    app.dependency_overrides[get_maps_service] = lambda: MapsService(
        LoopFakeProvider(), 20, 20, 10, 8
    )
    try:
        response = client.post("/explore/routes/walking", json=_payload(route_type="loop"))
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["route_type"] == "loop"
    assert body["return_is_same_path"] is False
    assert [leg["kind"] for leg in body["legs"]] == ["outbound", "return"]
    assert body["duration_seconds"] == sum(leg["duration_seconds"] for leg in body["legs"])
    assert body["distance_meters"] == sum(leg["distance_meters"] for leg in body["legs"])


def test_walking_route_destination_place_id_can_be_omitted(client: TestClient) -> None:
    """SS-33 決定: place_id は route_type によらず常に任意(422にならない)。"""
    app.dependency_overrides[get_current_user_optional] = lambda: object()
    app.dependency_overrides[get_maps_service] = lambda: MapsService(FakeProvider(), 20, 20, 10, 8)
    try:
        response = client.post(
            "/explore/routes/walking",
            json={
                "origin": {"latitude": 35, "longitude": 139},
                "destination": {"location": {"latitude": 35.1, "longitude": 139.1}},
                "route_type": "one_way",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["destination"]["place_id"] is None
    assert response.json()["destination"]["name"] == ""


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


def test_walking_route_returns_loop_when_maps_mode_is_fake() -> None:
    """MAPS_MODE=fake でも周回(2 leg)が返ること(mobile の E2E の前提。完了条件チェックリスト)。"""
    settings = Settings(env="test", maps_mode="fake", auth_jwt_secret="x" * 32)
    fake_app = create_app(settings)
    fake_app.dependency_overrides[get_current_user_optional] = lambda: object()
    fake_app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(fake_app) as fake_client:
            response = fake_client.post(
                "/explore/routes/walking",
                json={
                    "origin": {"latitude": 35.6812, "longitude": 139.7671},
                    "destination": {"location": {"latitude": 35.69, "longitude": 139.78}},
                },
            )
    finally:
        fake_app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["route_type"] == "loop"
    assert len(body["legs"]) == 2
    assert [leg["kind"] for leg in body["legs"]] == ["outbound", "return"]


def test_openapi_declares_public_explore_endpoints_and_documented_error_responses() -> None:
    operation = app.openapi()["paths"]["/explore/routes/walking"]["post"]
    assert "security" not in operation
    assert {"401", "413", "422", "429", "503"} <= set(operation["responses"])
    assert "rate limit" in operation["responses"]["429"]["description"]


def test_committed_openapi_keeps_public_explore_contract() -> None:
    openapi_path = Path(__file__).parents[4] / "openapi.yaml"
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


def test_walking_route_leg_kind_enum_values_are_fixed() -> None:
    """mobile 要求 §8.6-3: `kind` の綴りを固定する。Orval が生成する型の元。"""
    schema = app.openapi()["components"]["schemas"]["WalkingRouteLegKind"]
    assert schema["enum"] == ["outbound", "return"]


def test_walking_route_type_enum_values_are_fixed() -> None:
    schema = app.openapi()["components"]["schemas"]["WalkingRouteType"]
    assert schema["enum"] == ["loop", "one_way"]


def test_openapi_route_response_descriptions_mention_entire_loop() -> None:
    """mobile 要求 §8.6-7 の回帰防止: 周回全体を指すフィールドにその旨の記述があること。"""
    properties = app.openapi()["components"]["schemas"]["WalkingRouteResponse"]["properties"]
    for field in ("duration_seconds", "distance_meters", "path", "bounds"):
        assert "entire loop" in properties[field]["description"]
