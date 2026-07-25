import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from sanposcape.auth.exceptions import InvalidAccessTokenError
from sanposcape.auth.tokens import (
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_refresh_token,
)
from sanposcape.config import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(
        env="test",
        auth_jwt_secret="x" * 32,
        auth_token_issuer="sanposcape",
        auth_token_audience="sanposcape-api",
        auth_access_token_ttl_seconds=900,
    )


def test_access_token_round_trip(settings: Settings) -> None:
    user_id = uuid.uuid4()
    token, expires_in = create_access_token(user_id, settings)

    claims = decode_access_token(token, settings)

    assert claims.sub == str(user_id)
    assert expires_in == 900


def test_access_token_expired_is_rejected(settings: Settings) -> None:
    user_id = uuid.uuid4()
    issued_at = datetime.now(UTC) - timedelta(seconds=settings.auth_access_token_ttl_seconds + 10)
    token, _ = create_access_token(user_id, settings, now=issued_at)

    with pytest.raises(InvalidAccessTokenError):
        decode_access_token(token, settings)


def test_access_token_tampered_is_rejected(settings: Settings) -> None:
    token, _ = create_access_token(uuid.uuid4(), settings)
    header, payload, signature = token.split(".")
    # 署名の末尾数文字（24bit分）を書き換える。1文字だけの置換だと base64url の
    # 端数ビットの都合でごく稀に元と同じバイト列にデコードされることがあるため、
    # 複数文字を確実に変える。
    tampered_signature = signature[:-4] + ("AAAA" if signature[-4:] != "AAAA" else "BBBB")
    tampered = ".".join([header, payload, tampered_signature])

    with pytest.raises(InvalidAccessTokenError):
        decode_access_token(tampered, settings)


def test_access_token_alg_none_is_rejected(settings: Settings) -> None:
    payload = {
        "sub": str(uuid.uuid4()),
        "iss": settings.auth_token_issuer,
        "aud": settings.auth_token_audience,
        "iat": int(datetime.now(UTC).timestamp()),
        "exp": int((datetime.now(UTC) + timedelta(minutes=5)).timestamp()),
        "jti": str(uuid.uuid4()),
        "typ": "access",
    }
    forged = jwt.encode(payload, "", algorithm="none")

    with pytest.raises(InvalidAccessTokenError):
        decode_access_token(forged, settings)


def test_access_token_wrong_secret_is_rejected(settings: Settings) -> None:
    token, _ = create_access_token(uuid.uuid4(), settings)
    other_settings = settings.model_copy(update={"auth_jwt_secret": "y" * 32})

    with pytest.raises(InvalidAccessTokenError):
        decode_access_token(token, other_settings)


def test_access_token_audience_mismatch_is_rejected(settings: Settings) -> None:
    token, _ = create_access_token(uuid.uuid4(), settings)
    other_settings = settings.model_copy(update={"auth_token_audience": "other-audience"})

    with pytest.raises(InvalidAccessTokenError):
        decode_access_token(token, other_settings)


def test_access_token_issuer_mismatch_is_rejected(settings: Settings) -> None:
    token, _ = create_access_token(uuid.uuid4(), settings)
    other_settings = settings.model_copy(update={"auth_token_issuer": "other-issuer"})

    with pytest.raises(InvalidAccessTokenError):
        decode_access_token(token, other_settings)


def test_access_token_wrong_typ_is_rejected(settings: Settings) -> None:
    """typ != 'access' のトークン（refresh token を access token として渡す取り違え）を拒否する。"""
    payload = {
        "sub": str(uuid.uuid4()),
        "iss": settings.auth_token_issuer,
        "aud": settings.auth_token_audience,
        "iat": int(datetime.now(UTC).timestamp()),
        "exp": int((datetime.now(UTC) + timedelta(minutes=5)).timestamp()),
        "jti": str(uuid.uuid4()),
        "typ": "refresh",
    }
    token = jwt.encode(payload, settings.auth_jwt_secret, algorithm="HS256")

    with pytest.raises(InvalidAccessTokenError):
        decode_access_token(token, settings)


def test_generate_refresh_token_is_random() -> None:
    tokens = {generate_refresh_token() for _ in range(20)}

    assert len(tokens) == 20


def test_hash_refresh_token_is_deterministic_64_char_hex() -> None:
    token = generate_refresh_token()

    first = hash_refresh_token(token)
    second = hash_refresh_token(token)

    assert first == second
    assert len(first) == 64
    assert all(c in "0123456789abcdef" for c in first)


def test_hash_refresh_token_differs_for_different_tokens() -> None:
    assert hash_refresh_token(generate_refresh_token()) != hash_refresh_token(
        generate_refresh_token()
    )
