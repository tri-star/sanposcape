from fastapi import Depends
from fastapi.testclient import TestClient

from sanposcape.config import Settings
from sanposcape.integrations.google_maps.client import UnconfiguredGoogleMapsProvider
from sanposcape.integrations.google_maps.provider import (
    GoogleMapsProvider,
    ProviderPoint,
    ProviderRoute,
)
from sanposcape.main import create_app
from sanposcape.maps.dependencies import get_google_maps_provider, get_maps_service
from sanposcape.maps.schemas import WalkingRouteRequest


def test_lifespan_reuses_provider_and_dependency_can_be_overridden() -> None:
    app = create_app(Settings(env="test", google_maps_server_api_key="test-key"))

    @app.get("/_test/provider-id")
    def provider_id(
        provider: GoogleMapsProvider = Depends(get_google_maps_provider),
    ) -> dict[str, int]:
        return {"id": id(provider)}

    with TestClient(app) as client:
        assert client.get("/_test/provider-id").json() == client.get("/_test/provider-id").json()
        override = UnconfiguredGoogleMapsProvider()
        app.dependency_overrides[get_google_maps_provider] = lambda: override
        assert client.get("/_test/provider-id").json() == {"id": id(override)}
    app.dependency_overrides.clear()


def test_get_maps_service_wires_the_loop_route_kill_switch_from_settings() -> None:
    """`get_maps_service` が `google_maps_loop_route_enabled=False` を `MapsService` へ
    正しく配線していることを固定する（DI 配線自体は fake E2E 経由の間接検証しかなかった）。
    kill switch オフなら候補取得（`get_walking_loop_route`）を一切呼ばず、単発の
    `get_walking_route` にフォールバックすることで配線を確認する。"""

    class RecordingProvider(UnconfiguredGoogleMapsProvider):
        def __init__(self) -> None:
            self.walking_route_calls = 0

        def get_walking_route(self, origin, destination, **kwargs):
            self.walking_route_calls += 1
            return ProviderRoute(
                duration_seconds=100,
                distance_meters=100,
                path=(ProviderPoint(35, 139), ProviderPoint(35.001, 139)),
            )

        def get_walking_loop_route(self, *args, **kwargs):
            raise AssertionError(
                "kill switch が正しく配線されていれば get_walking_loop_route は呼ばれない"
            )

    provider = RecordingProvider()
    settings = Settings(
        google_maps_loop_route_enabled=False, google_maps_route_deadline_seconds=5.0
    )

    service = get_maps_service(settings, provider)
    result = service.get_loop_walking_route(
        WalkingRouteRequest.model_validate(
            {
                "origin": {"latitude": 35, "longitude": 139},
                "destination": {
                    "place_id": "dest",
                    "name": "Dest",
                    "location": {"latitude": 35.001, "longitude": 139},
                },
            }
        )
    )

    assert result.return_is_same_path is True
    assert provider.walking_route_calls == 1
