"""自前セッショントークンの発行・検証ユーティリティ。

- access token: 短命の HS256 JWT（ステートレス）
- refresh token: opaque なランダム値。DB には sha256 ハッシュのみ保存する
"""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt

from sanposcape.auth.exceptions import InvalidAccessTokenError
from sanposcape.config import Settings

ACCESS_TOKEN_TYPE = "access"


@dataclass(frozen=True)
class AccessTokenClaims:
    sub: str
    jti: str
    iat: int
    exp: int


def create_access_token(
    user_id: uuid.UUID | str,
    settings: Settings,
    now: datetime | None = None,
) -> tuple[str, int]:
    """access token を発行する。戻り値は `(token, expires_in)`。"""
    now = now or datetime.now(UTC)
    expires_at = now + timedelta(seconds=settings.auth_access_token_ttl_seconds)
    payload = {
        "sub": str(user_id),
        "iss": settings.auth_token_issuer,
        "aud": settings.auth_token_audience,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "jti": str(uuid.uuid4()),
        "typ": ACCESS_TOKEN_TYPE,
    }
    token = jwt.encode(payload, settings.auth_jwt_secret, algorithm="HS256")
    return token, settings.auth_access_token_ttl_seconds


def decode_access_token(token: str, settings: Settings) -> AccessTokenClaims:
    """access token を検証してクレームを返す。失敗時は `InvalidAccessTokenError`。"""
    try:
        claims = jwt.decode(
            token,
            settings.auth_jwt_secret,
            algorithms=["HS256"],  # alg 混同攻撃（none / 非対称鍵なりすまし）を排除
            audience=settings.auth_token_audience,
            issuer=settings.auth_token_issuer,
            leeway=0,  # モバイルが 30 秒前倒しで refresh するため猶予は不要
            options={"require": ["sub", "exp", "iat", "iss", "aud"]},
        )
    except jwt.PyJWTError as exc:
        raise InvalidAccessTokenError("Invalid access token") from exc

    if claims.get("typ") != ACCESS_TOKEN_TYPE:
        # refresh token 文字列などを access token として渡された場合の取り違え防止
        raise InvalidAccessTokenError("Token is not an access token")

    return AccessTokenClaims(
        sub=claims["sub"],
        jti=claims.get("jti", ""),
        iat=claims["iat"],
        exp=claims["exp"],
    )


def generate_refresh_token() -> str:
    """256bit のランダム opaque トークンを生成する。"""
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    """refresh token の DB 保存用ハッシュ（sha256 hex）を計算する。

    高エントロピーな乱数値のため辞書攻撃の対象にならず、bcrypt/argon2 のような
    低速ハッシュは不要。ハッシュ一致検索（index 可能）であることを優先し、
    ソルト付きハッシュも使わない。
    TODO: さらに強化する場合は HMAC-SHA256(auth_jwt_secret, token) にすると
    DB 単体流出時のオフライン照合を防げる（MVP では不採用）。
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
