from datetime import timedelta

import jwt
import pytest
from jwt.exceptions import DecodeError, PyJWKClientConnectionError, PyJWKClientError
from jwt.jwks_client import PyJWKClient

from sanposcape.auth.exceptions import IdentityProviderUnavailableError, InvalidIdTokenError
from sanposcape.auth.providers.apple import AppleIdentityProvider
from sanposcape.auth.tests.conftest import APPLE_AUDIENCE, RAW_NONCE, FakeJWKSClient, hash_nonce
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
        apple_allowed_audiences=[APPLE_AUDIENCE, "second-apple-audience"],
    )


@pytest.fixture
def provider(provider_settings, rsa_keypair) -> AppleIdentityProvider:
    _, public_key = rsa_keypair
    return AppleIdentityProvider(provider_settings, jwks_client=FakeJWKSClient(public_key))


def test_verify_maps_valid_token_to_provider_identity(provider, make_apple_id_token) -> None:
    token = make_apple_id_token(sub="apple-sub-1", email="user@example.com")

    identity = provider.verify(token, nonce=RAW_NONCE)

    assert identity.provider == "apple"
    assert identity.subject == "apple-sub-1"
    assert identity.email == "user@example.com"
    assert identity.display_name is None
    assert identity.photo_url is None


def test_verify_accepts_any_allowed_audience(provider, make_apple_id_token) -> None:
    token = make_apple_id_token(aud="second-apple-audience")

    assert provider.verify(token, nonce=RAW_NONCE).provider == "apple"


class TestRejectsInvalidClaims:
    def test_rejects_unknown_audience(self, provider, make_apple_id_token) -> None:
        token = make_apple_id_token(aud="host.exp.Exponent")

        with pytest.raises(InvalidIdTokenError):
            provider.verify(token, nonce=RAW_NONCE)

    def test_rejects_unknown_issuer(self, provider, make_apple_id_token) -> None:
        token = make_apple_id_token(iss="https://evil.example.com")

        with pytest.raises(InvalidIdTokenError):
            provider.verify(token, nonce=RAW_NONCE)

    def test_rejects_google_issuer(self, provider, make_apple_id_token) -> None:
        token = make_apple_id_token(iss="https://accounts.google.com")

        with pytest.raises(InvalidIdTokenError):
            provider.verify(token, nonce=RAW_NONCE)

    def test_rejects_expired_token(self, provider, make_apple_id_token) -> None:
        # leeway(60 秒) を超えて期限切れ
        token = make_apple_id_token(exp_delta=-timedelta(minutes=90))

        with pytest.raises(InvalidIdTokenError):
            provider.verify(token, nonce=RAW_NONCE)

    def test_accepts_token_expired_within_leeway(self, provider, make_apple_id_token) -> None:
        token = make_apple_id_token(exp_delta=-timedelta(seconds=30))

        assert provider.verify(token, nonce=RAW_NONCE).provider == "apple"

    def test_rejects_missing_sub(self, provider, make_apple_id_token) -> None:
        token = make_apple_id_token(include_sub=False)

        with pytest.raises(InvalidIdTokenError):
            provider.verify(token, nonce=RAW_NONCE)

    def test_rejects_token_signed_by_untrusted_key(
        self, provider, other_rsa_keypair, make_apple_id_token
    ) -> None:
        other_private_key, _ = other_rsa_keypair
        token = make_apple_id_token(key=other_private_key)

        with pytest.raises(InvalidIdTokenError):
            provider.verify(token, nonce=RAW_NONCE)

    def test_rejects_malformed_token(self, provider) -> None:
        with pytest.raises(InvalidIdTokenError):
            provider.verify("not-a-jwt", nonce=RAW_NONCE)

    def test_rejects_missing_iat(self, provider, make_apple_id_token) -> None:
        token = make_apple_id_token(include_iat=False)

        with pytest.raises(InvalidIdTokenError):
            provider.verify(token, nonce=RAW_NONCE)

    def test_rejects_alg_none_token(self, provider, make_apple_id_token) -> None:
        signed = jwt.decode(make_apple_id_token(), options={"verify_signature": False})
        token = jwt.encode(signed, None, algorithm="none", headers={"kid": "test-key-1"})

        with pytest.raises(InvalidIdTokenError):
            provider.verify(token, nonce=RAW_NONCE)

    def test_rejects_hs256_token(self, provider, make_apple_id_token) -> None:
        # alg 混同攻撃: RS256 以外（HMAC）で署名した token は alg で弾く
        # （PyJWT は公開鍵 PEM を HMAC の秘密にできないため、固定の秘密で署名する）
        claims = jwt.decode(make_apple_id_token(), options={"verify_signature": False})
        token = jwt.encode(claims, "x" * 32, algorithm="HS256", headers={"kid": "test-key-1"})

        with pytest.raises(InvalidIdTokenError):
            provider.verify(token, nonce=RAW_NONCE)

    @pytest.mark.parametrize("sub", ["", 12345, None])
    def test_rejects_empty_or_non_string_sub(self, provider, make_apple_id_token, sub) -> None:
        token = make_apple_id_token(sub=sub)  # type: ignore[arg-type]

        with pytest.raises(InvalidIdTokenError):
            provider.verify(token, nonce=RAW_NONCE)

    def test_decode_error_while_resolving_key_is_invalid_token(
        self, provider_settings, make_apple_id_token
    ) -> None:
        # 実機の PyJWKClient は JWT として読めない入力で DecodeError を投げる
        provider = AppleIdentityProvider(
            provider_settings, jwks_client=_RaisingJWKSClient(DecodeError("Not enough segments"))
        )

        with pytest.raises(InvalidIdTokenError):
            provider.verify("not-a-jwt", nonce=RAW_NONCE)

    def test_non_jwt_with_real_jwks_client_is_invalid_token(self, provider_settings) -> None:
        # JWKS の取得より前に失敗するのでネットワークには出ない
        provider = AppleIdentityProvider(
            provider_settings, jwks_client=PyJWKClient("https://example.invalid/keys", timeout=1)
        )

        with pytest.raises(InvalidIdTokenError):
            provider.verify("not-a-jwt", nonce=RAW_NONCE)


class TestNonce:
    def test_rejects_nonce_mismatch(self, provider, make_apple_id_token) -> None:
        token = make_apple_id_token()

        with pytest.raises(InvalidIdTokenError):
            provider.verify(token, nonce="another-raw-nonce-0123456789")

    def test_rejects_when_request_nonce_is_none(self, provider, make_apple_id_token) -> None:
        token = make_apple_id_token()

        with pytest.raises(InvalidIdTokenError):
            provider.verify(token, nonce=None)

    def test_rejects_when_token_has_no_nonce_claim(self, provider, make_apple_id_token) -> None:
        token = make_apple_id_token(include_nonce=False)

        with pytest.raises(InvalidIdTokenError):
            provider.verify(token, nonce=RAW_NONCE)

    def test_rejects_raw_nonce_placed_in_token_unhashed(
        self, provider, make_apple_id_token
    ) -> None:
        # token の nonce をそのまま送り返しても通らない（リプレイ防止になる）
        token = make_apple_id_token(nonce=RAW_NONCE)

        with pytest.raises(InvalidIdTokenError):
            provider.verify(token, nonce=RAW_NONCE)

    def test_rejects_replay_with_token_nonce_claim_as_request_nonce(
        self, provider, make_apple_id_token
    ) -> None:
        hashed = hash_nonce(RAW_NONCE)
        token = make_apple_id_token(nonce=hashed)

        with pytest.raises(InvalidIdTokenError):
            provider.verify(token, nonce=hashed)

    def test_accepts_uppercase_hex_nonce_claim(self, provider, make_apple_id_token) -> None:
        token = make_apple_id_token(nonce=hash_nonce(RAW_NONCE).upper())

        assert provider.verify(token, nonce=RAW_NONCE).provider == "apple"

    def test_rejects_non_ascii_nonce_claim(self, provider, make_apple_id_token) -> None:
        # 署名済み token でも nonce クレームは任意の文字列でありうる。500 にならず 401 にする。
        token = make_apple_id_token(nonce="é" + hash_nonce(RAW_NONCE))

        with pytest.raises(InvalidIdTokenError):
            provider.verify(token, nonce=RAW_NONCE)

    def test_rejects_non_string_nonce_claim(self, provider, make_apple_id_token) -> None:
        token = make_apple_id_token(nonce=123)  # type: ignore[arg-type]

        with pytest.raises(InvalidIdTokenError):
            provider.verify(token, nonce=RAW_NONCE)


class TestEmail:
    @pytest.mark.parametrize("verified", [True, "true", "True"])
    def test_keeps_verified_email(self, provider, make_apple_id_token, verified) -> None:
        token = make_apple_id_token(email="user@example.com", email_verified=verified)

        assert provider.verify(token, nonce=RAW_NONCE).email == "user@example.com"

    @pytest.mark.parametrize("verified", [False, "false", None, "yes", 1])
    def test_drops_unverified_email(self, provider, make_apple_id_token, verified) -> None:
        token = make_apple_id_token(email="user@example.com", email_verified=verified)

        assert provider.verify(token, nonce=RAW_NONCE).email is None

    def test_email_is_none_when_claim_is_missing(self, provider, make_apple_id_token) -> None:
        token = make_apple_id_token(email=None)

        assert provider.verify(token, nonce=RAW_NONCE).email is None

    def test_keeps_private_relay_address(self, provider, make_apple_id_token) -> None:
        relay = "abc123@privaterelay.appleid.com"
        token = make_apple_id_token(email=relay, is_private_email="true")

        assert provider.verify(token, nonce=RAW_NONCE).email == relay


class TestJwks:
    def test_connection_error_is_unavailable(self, provider_settings, make_apple_id_token) -> None:
        provider = AppleIdentityProvider(
            provider_settings, jwks_client=_RaisingJWKSClient(PyJWKClientConnectionError("down"))
        )

        with pytest.raises(IdentityProviderUnavailableError):
            provider.verify(make_apple_id_token(), nonce=RAW_NONCE)

    def test_unknown_kid_is_invalid_token(self, provider_settings, make_apple_id_token) -> None:
        provider = AppleIdentityProvider(
            provider_settings, jwks_client=_RaisingJWKSClient(PyJWKClientError("no kid"))
        )

        with pytest.raises(InvalidIdTokenError):
            provider.verify(make_apple_id_token(), nonce=RAW_NONCE)
