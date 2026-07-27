from fastapi import Depends
from fastapi.testclient import TestClient

from sanposcape.config import Settings
from sanposcape.integrations.google_maps.client import UnconfiguredGoogleMapsProvider
from sanposcape.integrations.google_maps.provider import GoogleMapsProvider
from sanposcape.main import create_app
from sanposcape.maps.dependencies import get_google_maps_provider


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
