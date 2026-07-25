from collections.abc import Generator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import jwt
import pytest
from fastapi.testclient import TestClient

from sanposcape.auth.dependencies import get_identity_providers
from sanposcape.auth.providers.google import GoogleIdentityProvider
from sanposcape.config import Settings, get_settings
from sanposcape.main import app


@dataclass
class FakeJWKSClient:
    """`PyJWKClient.get_signing_key_from_jwt` だけを模した最小のフェイク。

    ネットワークに一切出ずに Google ID token 検証ロジックだけをテストするための DI 差し替え先。
    """

    public_key: object

    def get_signing_key_from_jwt(self, token: str) -> SimpleNamespace:
        return SimpleNamespace(key=self.public_key)


@pytest.fixture
def make_google_id_token(rsa_keypair):
    """テスト用の Google ID token を任意のクレームで生成するファクトリ。"""
    private_key, _ = rsa_keypair

    def _make(
        *,
        sub: str = "google-sub-1",
        aud: str = "test-audience",
        iss: str = "https://accounts.google.com",
        exp_delta: timedelta = timedelta(minutes=30),
        email: str | None = "user@example.com",
        name: str | None = "テストユーザー",
        picture: str | None = "https://example.com/p.png",
        key: object | None = None,
        include_sub: bool = True,
    ) -> str:
        now = datetime.now(UTC)
        claims: dict[str, object] = {
            "iss": iss,
            "aud": aud,
            "iat": int(now.timestamp()),
            "exp": int((now + exp_delta).timestamp()),
        }
        if include_sub:
            claims["sub"] = sub
        if email is not None:
            claims["email"] = email
            claims["email_verified"] = True
        if name is not None:
            claims["name"] = name
        if picture is not None:
            claims["picture"] = picture
        return jwt.encode(
            claims, key or private_key, algorithm="RS256", headers={"kid": "test-key-1"}
        )

    return _make


@pytest.fixture
def auth_client(
    client: TestClient, rsa_keypair, test_settings: Settings
) -> Generator[TestClient, None, None]:
    """FakeJWKSClient を注入した `/auth/*` 用クライアント（Google へは一切接続しない）。"""
    _, public_key = rsa_keypair
    providers = {
        "google": GoogleIdentityProvider(test_settings, jwks_client=FakeJWKSClient(public_key))
    }
    app.dependency_overrides[get_identity_providers] = lambda: providers
    app.dependency_overrides[get_settings] = lambda: test_settings
    yield client
    app.dependency_overrides.clear()
