from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from sanposcape.auth.dependencies import get_identity_providers
from sanposcape.auth.providers.google import GoogleIdentityProvider
from sanposcape.auth.tests.conftest import FakeJWKSClient
from sanposcape.auth.tests.conftest import make_google_id_token as make_google_id_token
from sanposcape.config import Settings, get_settings
from sanposcape.main import app


@pytest.fixture
def auth_client(
    client: TestClient, rsa_keypair, test_settings: Settings
) -> Generator[TestClient, None, None]:
    """users API テスト向けに、Google JWKS をローカルの公開鍵へ差し替える。"""
    _, public_key = rsa_keypair
    providers = {
        "google": GoogleIdentityProvider(
            test_settings,
            jwks_client=FakeJWKSClient(public_key),
        )
    }
    app.dependency_overrides[get_identity_providers] = lambda: providers
    app.dependency_overrides[get_settings] = lambda: test_settings
    yield client
    app.dependency_overrides.clear()
