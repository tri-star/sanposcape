import hashlib
from collections.abc import Callable, Generator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import jwt
import pytest
from fastapi.testclient import TestClient

from sanposcape.auth.dependencies import get_identity_providers
from sanposcape.auth.providers.apple import AppleIdentityProvider
from sanposcape.auth.providers.google import GoogleIdentityProvider
from sanposcape.config import Settings, get_settings
from sanposcape.integrations.apple.client import AppleTokenGrant
from sanposcape.main import app
from sanposcape.users.dependencies import get_apple_sign_in_client

# 端末が生成する raw nonce（16 文字以上）。
# Apple には sha256 の hex を渡し、backend には raw を送る。
RAW_NONCE = "raw-nonce-for-test-0123456789"
APPLE_AUDIENCE = "test-apple-audience"
# `make_apple_id_token` の既定の sub。
APPLE_DEFAULT_SUB = "001234.0123456789abcdef0123456789abcdef.1234"


def hash_nonce(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@dataclass
class FakeJWKSClient:
    """`PyJWKClient.get_signing_key_from_jwt` だけを模した最小のフェイク。

    ネットワークに一切出ずに Google / Apple の ID token 検証ロジックだけをテストするための
    DI 差し替え先。
    """

    public_key: object

    def get_signing_key_from_jwt(self, token: str) -> SimpleNamespace:
        return SimpleNamespace(key=self.public_key)


@dataclass
class FakeAppleSignInClient:
    """`AppleSignInClient` の Fake。呼び出しを記録し、返す grant・投げる例外を設定できる。

    どのテストも Apple に出ないことを保証するため、`auth_client` が DI でこれに差し替える。
    `on_exchange` / `on_revoke` は呼び出しの瞬間の状態（DB のトランザクション等）を検証する
    ためのフック。
    """

    # 交換結果の sub。既定は `make_apple_id_token` の既定の sub と同じ。
    subject: str | None = APPLE_DEFAULT_SUB
    # None なら呼ばれた `client_id` をそのまま返す。
    audience: str | None = None
    exchange_error: Exception | None = None
    revoke_error: Exception | None = None
    on_exchange: Callable[[], None] | None = None
    on_revoke: Callable[[], None] | None = None
    exchange_calls: list[tuple[str, str]] = field(default_factory=list)  # (code, client_id)
    revoke_calls: list[tuple[str, str]] = field(default_factory=list)  # (refresh_token, client_id)

    def exchange_authorization_code(self, code: str, *, client_id: str) -> AppleTokenGrant:
        self.exchange_calls.append((code, client_id))
        if self.on_exchange is not None:
            self.on_exchange()
        if self.exchange_error is not None:
            raise self.exchange_error
        return AppleTokenGrant(
            refresh_token=f"refresh-token-for-{code}",
            subject=self.subject,
            audience=self.audience or client_id,
        )

    def revoke_refresh_token(self, refresh_token: str, *, client_id: str) -> None:
        self.revoke_calls.append((refresh_token, client_id))
        if self.on_revoke is not None:
            self.on_revoke()
        if self.revoke_error is not None:
            raise self.revoke_error


@pytest.fixture
def fake_apple_client() -> FakeAppleSignInClient:
    return FakeAppleSignInClient()


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
def make_apple_id_token(rsa_keypair):
    """テスト用の Apple ID token を任意のクレームで生成するファクトリ。"""
    private_key, _ = rsa_keypair

    def _make(
        *,
        sub: str = "001234.0123456789abcdef0123456789abcdef.1234",
        aud: str = APPLE_AUDIENCE,
        iss: str = "https://appleid.apple.com",
        exp_delta: timedelta = timedelta(minutes=10),
        nonce: str | None = None,
        include_nonce: bool = True,
        include_sub: bool = True,
        include_iat: bool = True,
        email: str | None = "user@example.com",
        email_verified: object = "true",
        is_private_email: object = "false",
        key: object | None = None,
    ) -> str:
        now = datetime.now(UTC)
        claims: dict[str, object] = {
            "iss": iss,
            "aud": aud,
            "iat": int(now.timestamp()),
            "exp": int((now + exp_delta).timestamp()),
        }
        if not include_iat:
            del claims["iat"]
        if include_sub:
            claims["sub"] = sub
        if include_nonce:
            claims["nonce"] = nonce if nonce is not None else hash_nonce(RAW_NONCE)
        if email is not None:
            claims["email"] = email
            if email_verified is not None:
                claims["email_verified"] = email_verified
            claims["is_private_email"] = is_private_email
        return jwt.encode(
            claims, key or private_key, algorithm="RS256", headers={"kid": "test-key-1"}
        )

    return _make


@pytest.fixture
def auth_client(
    client: TestClient,
    rsa_keypair,
    test_settings: Settings,
    fake_apple_client: FakeAppleSignInClient,
) -> Generator[TestClient, None, None]:
    """FakeJWKSClient と FakeAppleSignInClient を注入した `/auth/*` 用クライアント。

    Google / Apple へは一切接続しない（ID token の検証も、Apple の REST API も）。
    """
    _, public_key = rsa_keypair
    providers = {
        "google": GoogleIdentityProvider(test_settings, jwks_client=FakeJWKSClient(public_key)),
        "apple": AppleIdentityProvider(test_settings, jwks_client=FakeJWKSClient(public_key)),
    }
    app.dependency_overrides[get_identity_providers] = lambda: providers
    app.dependency_overrides[get_settings] = lambda: test_settings
    app.dependency_overrides[get_apple_sign_in_client] = lambda: fake_apple_client
    yield client
    app.dependency_overrides.clear()
