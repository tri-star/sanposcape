from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from sanposcape.auth.dependencies import get_identity_providers
from sanposcape.auth.providers.apple import AppleIdentityProvider
from sanposcape.auth.providers.google import GoogleIdentityProvider
from sanposcape.auth.tests.conftest import FakeAppleSignInClient, FakeJWKSClient
from sanposcape.auth.tests.conftest import fake_apple_client as fake_apple_client
from sanposcape.auth.tests.conftest import make_apple_id_token as make_apple_id_token
from sanposcape.auth.tests.conftest import make_google_id_token as make_google_id_token
from sanposcape.config import Settings, get_settings
from sanposcape.main import app
from sanposcape.users.dependencies import get_apple_sign_in_client


@pytest.fixture
def auth_client(
    client: TestClient,
    rsa_keypair,
    test_settings: Settings,
    fake_apple_client: FakeAppleSignInClient,
) -> Generator[TestClient, None, None]:
    """users API テスト向けに、Google / Apple の JWKS をローカルの公開鍵へ、
    Apple の REST API を Fake へ差し替える（Apple へは一切接続しない）。"""
    _, public_key = rsa_keypair
    providers = {
        "google": GoogleIdentityProvider(
            test_settings,
            jwks_client=FakeJWKSClient(public_key),
        ),
        "apple": AppleIdentityProvider(test_settings, jwks_client=FakeJWKSClient(public_key)),
    }
    app.dependency_overrides[get_identity_providers] = lambda: providers
    app.dependency_overrides[get_settings] = lambda: test_settings
    app.dependency_overrides[get_apple_sign_in_client] = lambda: fake_apple_client
    yield client
    app.dependency_overrides.clear()
