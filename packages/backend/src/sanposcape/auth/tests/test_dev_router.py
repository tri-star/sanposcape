from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from sanposcape.auth.dependencies import get_identity_providers
from sanposcape.auth.providers.google import GoogleIdentityProvider
from sanposcape.auth.tests.conftest import FakeJWKSClient
from sanposcape.config import Settings, get_settings
from sanposcape.conftest import _override_get_db
from sanposcape.database import get_db
from sanposcape.main import create_app


@pytest.fixture
def real_client(test_settings: Settings) -> Generator[TestClient, None, None]:
    """`AUTH_MODE=real`（コード既定と同値）で組み立てたアプリのクライアント。

    ambient な `main.app`（ローカルの `.env` の値に左右されうる）ではなく、
    テストコード内で明示構築した設定を使うことで、CI とローカルで結果が変わらないようにする。
    """
    real_app = create_app(test_settings)
    real_app.dependency_overrides[get_db] = _override_get_db
    real_app.dependency_overrides[get_settings] = lambda: test_settings
    with TestClient(real_app) as test_client:
        yield test_client
    real_app.dependency_overrides.clear()


def _install_fake_google_provider(client: TestClient, rsa_keypair, settings: Settings) -> None:
    _, public_key = rsa_keypair
    providers = {"google": GoogleIdentityProvider(settings, jwks_client=FakeJWKSClient(public_key))}
    client.app.dependency_overrides[get_identity_providers] = lambda: providers


def test_dev_session_returns_404_on_default_real_mode(real_client: TestClient) -> None:
    res = real_client.post("/auth/dev-session", json={"user_key": "dev-user-1"})
    assert res.status_code == 404


def test_dev_session_returns_200_on_dev_mode(dev_client: TestClient) -> None:
    res = dev_client.post("/auth/dev-session", json={"user_key": "dev-user-1"})
    assert res.status_code == 200
    body = res.json()
    assert body["access_token"]
    assert body["user"]["display_name"] == "dev-user-1"
    assert body["user"]["email"] == "dev-user-1@dev.local"


def test_dev_session_oversized_user_key_returns_422(dev_client: TestClient) -> None:
    """B-1: `user_key` にも上限が無いと、巨大な文字列によるDoSの入り口になり得る。"""
    res = dev_client.post("/auth/dev-session", json={"user_key": "a" * 257})
    assert res.status_code == 422


def test_dev_session_same_user_key_returns_same_user_id(dev_client: TestClient) -> None:
    first = dev_client.post("/auth/dev-session", json={"user_key": "dev-user-1"}).json()
    second = dev_client.post("/auth/dev-session", json={"user_key": "dev-user-1"}).json()

    assert first["user"]["id"] == second["user"]["id"]


def test_dev_session_token_passes_get_current_user(dev_client: TestClient) -> None:
    """dev で発行したトークンで /auth/me が通ることは、real と同一コードパス
    （_resolve_user / _issue_session の共有）を経由していることの証明になる（ADR-002 決定3）。
    """
    session = dev_client.post("/auth/dev-session", json={"user_key": "dev-user-1"}).json()

    res = dev_client.get("/auth/me", headers={"Authorization": f"Bearer {session['access_token']}"})

    assert res.status_code == 200
    assert res.json()["id"] == session["user"]["id"]


def test_dev_user_and_google_user_are_different_records(
    dev_client: TestClient, rsa_keypair, dev_settings: Settings, make_google_id_token
) -> None:
    _install_fake_google_provider(dev_client, rsa_keypair, dev_settings)

    dev_session = dev_client.post("/auth/dev-session", json={"user_key": "shared-subject"}).json()
    google_token = make_google_id_token(sub="shared-subject")
    google_session = dev_client.post(
        "/auth/session", json={"provider": "google", "id_token": google_token}
    ).json()

    assert dev_session["user"]["id"] != google_session["user"]["id"]


def test_dev_session_is_routable_but_not_in_schema(
    dev_client: TestClient, dev_settings: Settings
) -> None:
    """D6 の不変条件その1: dev モードでは 200 が返るが、OpenAPI スキーマには載らない
    （export_openapi.py を無改修のままにできる根拠）。
    """
    res = dev_client.post("/auth/dev-session", json={"user_key": "x"})
    assert res.status_code == 200

    schema = create_app(dev_settings).openapi()
    assert "/auth/dev-session" not in schema["paths"]
    assert "DevSessionCreate" not in schema.get("components", {}).get("schemas", {})


def test_openapi_output_is_identical_regardless_of_auth_mode(
    test_settings: Settings, dev_settings: Settings
) -> None:
    """D6 の不変条件その2: AUTH_MODE を変えても openapi() の出力は完全に同一。"""
    real_schema = create_app(test_settings).openapi()
    dev_schema = create_app(dev_settings).openapi()

    assert real_schema == dev_schema
