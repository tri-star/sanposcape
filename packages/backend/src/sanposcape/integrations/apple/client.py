"""Apple の REST API クライアント（authorization code の交換とトークンの失効。SS-198）。

- `POST /auth/token`: サインイン時に端末から受け取った code を refresh token に交換する。
- `POST /auth/revoke`: アカウント削除時に refresh token を失効させる（Apple は冪等。
  既に無効な token にも 200 を返す）。

どちらも form-urlencoded で、`client_secret` は呼び出しごとに生成する（キャッシュしない）。
再試行はしない: code は 1 回限りで、タイムアウトでも Apple 側が成功している可能性があるため。
失効はユーザーの再試行に任せる。

ログ・例外メッセージ・スパンに code・refresh token・client secret・交換レスポンスの
id_token を出さない（ADR-013）。このモジュールはログを出さず、結果の重み付けは呼び出し側が行う。
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

import httpx
import jwt
from cryptography.hazmat.primitives.asymmetric import ec

from sanposcape.config import Settings
from sanposcape.integrations.apple.client_secret import build_client_secret, load_private_key
from sanposcape.integrations.apple.exceptions import (
    AppleSignInNotConfiguredError,
    AppleSignInRejectedError,
    AppleSignInUnavailableError,
)

logger = logging.getLogger(__name__)

_TOKEN_URL = "https://appleid.apple.com/auth/token"
_REVOKE_URL = "https://appleid.apple.com/auth/revoke"
# Apple の ErrorResponse.error の既知の値。それ以外は "unknown" に丸める。
_KNOWN_ERROR_CODES = frozenset(
    {
        "invalid_request",
        "invalid_client",
        "invalid_grant",
        "unauthorized_client",
        "unsupported_grant_type",
        "invalid_scope",
    }
)


@dataclass(frozen=True)
class AppleTokenGrant:
    """code の交換結果。`subject` / `audience` は交換レスポンスの id_token から読んだ値。"""

    refresh_token: str
    subject: str | None
    audience: str | None

    def __repr__(self) -> str:
        # refresh token を repr（ログ・pytest の差分表示）に出さない。
        return f"AppleTokenGrant(subject={self.subject!r}, audience={self.audience!r})"


class AppleSignInClient(Protocol):
    def exchange_authorization_code(self, code: str, *, client_id: str) -> AppleTokenGrant:
        """code を refresh token に交換する。失敗は `AppleSignInError` のサブクラス。"""
        ...

    def revoke_refresh_token(self, refresh_token: str, *, client_id: str) -> None:
        """refresh token を失効させる。失敗は `AppleSignInError` のサブクラス。"""
        ...


class UnconfiguredAppleSignInClient:
    """鍵が未設定のときの安全な既定値。Apple へは一切出ない。"""

    def exchange_authorization_code(self, code: str, *, client_id: str) -> AppleTokenGrant:
        raise AppleSignInNotConfiguredError("Apple sign-in client is not configured")

    def revoke_refresh_token(self, refresh_token: str, *, client_id: str) -> None:
        raise AppleSignInNotConfiguredError("Apple sign-in client is not configured")


def _read_id_token_claims(id_token: object) -> tuple[str | None, str | None]:
    """交換レスポンスの id_token から `sub` と `aud` だけを読む。

    TLS で Apple から直接受け取った token なので署名は検証しない（OIDC Core 3.1.3.7）。
    目的は「他人の code を自分のアカウントに紐付ける」ことの防止であり、読めなければ None。
    """
    if not isinstance(id_token, str):
        return None, None
    try:
        claims = jwt.decode(id_token, options={"verify_signature": False})
    except jwt.PyJWTError:
        return None, None
    subject = claims.get("sub")
    audience = claims.get("aud")
    return (
        subject if isinstance(subject, str) else None,
        audience if isinstance(audience, str) else None,
    )


def _error_code(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return "unknown"
    code = body.get("error") if isinstance(body, dict) else None
    return code if isinstance(code, str) and code in _KNOWN_ERROR_CODES else "unknown"


class HttpAppleSignInClient:
    def __init__(
        self,
        settings: Settings,
        *,
        private_key: ec.EllipticCurvePrivateKey,
        client: httpx.Client | None = None,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._team_id = settings.apple_team_id
        self._key_id = settings.apple_sign_in_key_id
        self._private_key = private_key
        self._now = now
        self._owns_client = client is None
        self._client = client or httpx.Client(
            timeout=httpx.Timeout(
                settings.apple_sign_in_read_timeout_seconds,
                connect=settings.apple_sign_in_connect_timeout_seconds,
            )
        )

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def exchange_authorization_code(self, code: str, *, client_id: str) -> AppleTokenGrant:
        response = self._post_form(
            _TOKEN_URL,
            {
                "client_id": client_id,
                "client_secret": self._client_secret(client_id),
                "code": code,
                "grant_type": "authorization_code",
            },
        )
        try:
            body = response.json()
        except ValueError as exc:
            raise AppleSignInUnavailableError("Apple token response is not JSON") from exc
        refresh_token = body.get("refresh_token") if isinstance(body, dict) else None
        if not isinstance(refresh_token, str) or not refresh_token:
            raise AppleSignInUnavailableError("Apple token response has no refresh_token")
        subject, audience = _read_id_token_claims(body.get("id_token"))
        return AppleTokenGrant(refresh_token=refresh_token, subject=subject, audience=audience)

    def revoke_refresh_token(self, refresh_token: str, *, client_id: str) -> None:
        # 200 は「失効させた、または既に無効だった」。ボディは読まない。
        self._post_form(
            _REVOKE_URL,
            {
                "client_id": client_id,
                "client_secret": self._client_secret(client_id),
                "token": refresh_token,
                "token_type_hint": "refresh_token",
            },
        )

    def _client_secret(self, client_id: str) -> str:
        return build_client_secret(
            team_id=self._team_id,
            key_id=self._key_id,
            private_key=self._private_key,
            client_id=client_id,
            now=self._now(),
        )

    def _post_form(self, url: str, data: dict[str, str]) -> httpx.Response:
        """form を POST し、200 以外を `Unavailable` / `Rejected` に分類して送出する。"""
        try:
            response = self._client.post(url, data=data)
        except httpx.TransportError as exc:  # TimeoutException を含む
            raise AppleSignInUnavailableError(
                f"Apple request failed: {type(exc).__name__}"
            ) from exc
        status = response.status_code
        if status == 200:
            return response
        if status == 429 or status >= 500:
            raise AppleSignInUnavailableError(f"Apple responded with HTTP {status}")
        if 400 <= status < 500:
            raise AppleSignInRejectedError(_error_code(response), status)
        raise AppleSignInUnavailableError(f"Apple responded with unexpected HTTP {status}")


def build_apple_sign_in_client(settings: Settings) -> AppleSignInClient:
    """設定から Apple クライアントを組み立てる（lifespan で 1 回だけ呼ぶ）。

    鍵が無い・壊れているときも起動は止めず、交換・失効だけが無効な `Unconfigured` を返す。
    ログには欠けている項目の名前だけを出し、値（PEM を含む）は出さない。
    """
    private_key_pem = settings.apple_sign_in_private_key.get_secret_value()
    items = {
        "APPLE_TEAM_ID": settings.apple_team_id,
        "APPLE_SIGN_IN_KEY_ID": settings.apple_sign_in_key_id,
        "APPLE_SIGN_IN_PRIVATE_KEY": private_key_pem,
    }
    missing = [name for name, value in items.items() if not value.strip()]
    if len(missing) == len(items):
        if settings.apple_allowed_audiences:
            logger.warning(
                "Sign in with Apple is enabled but its key is not configured; "
                "authorization code exchange and token revocation are disabled"
            )
        return UnconfiguredAppleSignInClient()
    if missing:
        logger.error(
            "Apple sign-in key settings are incomplete (missing: %s); "
            "authorization code exchange and token revocation are disabled",
            ", ".join(missing),
        )
        return UnconfiguredAppleSignInClient()
    try:
        private_key = load_private_key(private_key_pem)
    except ValueError:
        logger.error(
            "APPLE_SIGN_IN_PRIVATE_KEY is not a valid EC P-256 PEM; "
            "authorization code exchange and token revocation are disabled"
        )
        return UnconfiguredAppleSignInClient()
    return HttpAppleSignInClient(settings, private_key=private_key)
