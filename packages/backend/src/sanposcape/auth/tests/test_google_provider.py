import json
from datetime import timedelta

import pytest
from jwt.algorithms import RSAAlgorithm
from jwt.exceptions import PyJWKClientConnectionError, PyJWKClientError
from jwt.jwks_client import PyJWKClient

from sanposcape.auth.exceptions import IdentityProviderUnavailableError, InvalidIdTokenError
from sanposcape.auth.providers.google import GoogleIdentityProvider
from sanposcape.auth.tests.conftest import FakeJWKSClient
from sanposcape.config import Settings


class _RaisingJWKSClient:
    def __init__(self, exc: Exception) -> None:
        self._exc = exc

    def get_signing_key_from_jwt(self, token: str) -> None:
        raise self._exc


@pytest.fixture
def provider_settings() -> Settings:
    return Settings(
        env="test",
        auth_jwt_secret="x" * 32,
        google_allowed_audiences=["test-audience", "second-audience"],
        google_allowed_issuers=["https://accounts.google.com", "accounts.google.com"],
    )


def test_verify_maps_valid_token_to_provider_identity(
    provider_settings, rsa_keypair, make_google_id_token
) -> None:
    _, public_key = rsa_keypair
    provider = GoogleIdentityProvider(provider_settings, jwks_client=FakeJWKSClient(public_key))
    token = make_google_id_token(
        sub="google-sub-1", email="user@example.com", name="テストユーザー"
    )

    identity = provider.verify(token)

    assert identity.provider == "google"
    assert identity.subject == "google-sub-1"
    assert identity.email == "user@example.com"
    assert identity.display_name == "テストユーザー"
    assert identity.photo_url == "https://example.com/p.png"


def test_verify_rejects_token_signed_by_untrusted_key(
    provider_settings, rsa_keypair, other_rsa_keypair, make_google_id_token
) -> None:
    other_private_key, _ = other_rsa_keypair
    _, trusted_public_key = rsa_keypair
    # 別鍵ペアで署名したトークンを、正規(rsa_keypair)の公開鍵で検証する → 署名不正
    token = make_google_id_token(key=other_private_key)
    provider = GoogleIdentityProvider(
        provider_settings, jwks_client=FakeJWKSClient(trusted_public_key)
    )

    with pytest.raises(InvalidIdTokenError):
        provider.verify(token)


def test_verify_rejects_audience_mismatch(
    provider_settings, rsa_keypair, make_google_id_token
) -> None:
    _, public_key = rsa_keypair
    provider = GoogleIdentityProvider(provider_settings, jwks_client=FakeJWKSClient(public_key))
    token = make_google_id_token(aud="unexpected-audience")

    with pytest.raises(InvalidIdTokenError):
        provider.verify(token)


def test_verify_rejects_issuer_mismatch(
    provider_settings, rsa_keypair, make_google_id_token
) -> None:
    _, public_key = rsa_keypair
    provider = GoogleIdentityProvider(provider_settings, jwks_client=FakeJWKSClient(public_key))
    token = make_google_id_token(iss="https://evil.example.com")

    with pytest.raises(InvalidIdTokenError):
        provider.verify(token)


def test_verify_rejects_expired_token(provider_settings, rsa_keypair, make_google_id_token) -> None:
    _, public_key = rsa_keypair
    provider = GoogleIdentityProvider(provider_settings, jwks_client=FakeJWKSClient(public_key))
    token = make_google_id_token(exp_delta=timedelta(minutes=-90))  # leeway(60s) を超える期限切れ

    with pytest.raises(InvalidIdTokenError):
        provider.verify(token)


def test_verify_rejects_missing_sub(provider_settings, rsa_keypair, make_google_id_token) -> None:
    _, public_key = rsa_keypair
    provider = GoogleIdentityProvider(provider_settings, jwks_client=FakeJWKSClient(public_key))
    token = make_google_id_token(include_sub=False)

    with pytest.raises(InvalidIdTokenError):
        provider.verify(token)


def test_verify_accepts_second_allowed_audience(
    provider_settings, rsa_keypair, make_google_id_token
) -> None:
    _, public_key = rsa_keypair
    provider = GoogleIdentityProvider(provider_settings, jwks_client=FakeJWKSClient(public_key))
    token = make_google_id_token(aud="second-audience")

    identity = provider.verify(token)

    assert identity.subject == "google-sub-1"


def test_verify_allows_missing_optional_claims(
    provider_settings, rsa_keypair, make_google_id_token
) -> None:
    _, public_key = rsa_keypair
    provider = GoogleIdentityProvider(provider_settings, jwks_client=FakeJWKSClient(public_key))
    token = make_google_id_token(email=None, name=None, picture=None)

    identity = provider.verify(token)

    assert identity.subject == "google-sub-1"
    assert identity.email is None
    assert identity.display_name is None
    assert identity.photo_url is None


def test_verify_maps_jwks_connection_error_to_unavailable(
    provider_settings, make_google_id_token
) -> None:
    provider = GoogleIdentityProvider(
        provider_settings,
        jwks_client=_RaisingJWKSClient(PyJWKClientConnectionError("network down")),
    )
    token = make_google_id_token()

    with pytest.raises(IdentityProviderUnavailableError):
        provider.verify(token)


def test_verify_maps_unknown_kid_to_invalid_id_token(
    provider_settings, make_google_id_token
) -> None:
    provider = GoogleIdentityProvider(
        provider_settings,
        jwks_client=_RaisingJWKSClient(PyJWKClientError("Unable to find a signing key")),
    )
    token = make_google_id_token()

    with pytest.raises(InvalidIdTokenError):
        provider.verify(token)


def test_jwks_conversion_resolves_signing_key_from_real_jwks_json(
    provider_settings, rsa_keypair, make_google_id_token, monkeypatch
) -> None:
    """PyJWKClient の実装(JWKS の JSON 表現からの鍵復元)を、ネットワーク無しでテストする。"""
    _, public_key = rsa_keypair
    jwks = {
        "keys": [
            {
                **json.loads(RSAAlgorithm.to_jwk(public_key)),
                "kid": "test-key-1",
                "use": "sig",
                "alg": "RS256",
            }
        ]
    }
    monkeypatch.setattr(PyJWKClient, "fetch_data", lambda self: jwks)
    real_jwks_client = PyJWKClient("https://example.com/certs", timeout=5)
    provider = GoogleIdentityProvider(provider_settings, jwks_client=real_jwks_client)
    token = make_google_id_token()

    identity = provider.verify(token)

    assert identity.subject == "google-sub-1"


def test_jwks_conversion_unknown_kid_raises_invalid_id_token(
    provider_settings, rsa_keypair, other_rsa_keypair, make_google_id_token, monkeypatch
) -> None:
    """鍵ローテーション後もキャッシュに無い kid のトークンが来た場合、
    自動で再取得(refresh)されるが、それでも見つからなければ不正トークン扱いになる。
    """
    _, public_key = rsa_keypair
    jwks = {
        "keys": [
            {
                **json.loads(RSAAlgorithm.to_jwk(public_key)),
                "kid": "known-key",
                "use": "sig",
                "alg": "RS256",
            }
        ]
    }
    monkeypatch.setattr(PyJWKClient, "fetch_data", lambda self: jwks)
    real_jwks_client = PyJWKClient("https://example.com/certs", timeout=5)
    provider = GoogleIdentityProvider(provider_settings, jwks_client=real_jwks_client)
    # make_google_id_token は headers={"kid": "test-key-1"} で署名するため、
    # 上記 JWKS の "known-key" とは一致しない。
    token = make_google_id_token()

    with pytest.raises(InvalidIdTokenError):
        provider.verify(token)
