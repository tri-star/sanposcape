"""Apple ID token（Sign in with Apple）の検証。

JWKS の取得・キャッシュは `PyJWKClient` に任せる。テストでは `jwks_client` を
DI で差し替え、ネットワークに一切出ずに検証ロジックをテストする（Google と同じ方式）。

この provider は ID token の検証だけを行う。authorization code の交換・Apple の
refresh token の保存・削除時の失効は `integrations/apple/` と `auth/apple_authorization.py`
（SS-198）が担う。ここでは、交換の client_id に使う検証済みの `aud` を `ProviderIdentity` に載せる。
"""

import hashlib
import hmac
import logging

import jwt
from jwt.exceptions import PyJWKClientConnectionError, PyJWKClientError

from sanposcape.auth.exceptions import IdentityProviderUnavailableError, InvalidIdTokenError
from sanposcape.auth.providers.base import ProviderIdentity
from sanposcape.auth.providers.jwks import JWKSClientProtocol, get_jwks_client
from sanposcape.config import Settings

logger = logging.getLogger(__name__)


def _is_true(value: object) -> bool:
    """Apple は `email_verified` を bool と文字列 "true" の両方で返すことがある。"""
    return value is True or (isinstance(value, str) and value.lower() == "true")


class AppleIdentityProvider:
    name = "apple"

    def __init__(self, settings: Settings, jwks_client: JWKSClientProtocol | None = None) -> None:
        self._settings = settings
        self._jwks = jwks_client or get_jwks_client(
            settings.apple_jwks_url, settings.apple_jwks_cache_lifespan_seconds
        )

    def verify(self, id_token: str, *, nonce: str | None = None) -> ProviderIdentity:
        # router のスキーマでも 422 にするが、router を経由しない呼び出しでも nonce を
        # 素通しさせないための防御層。
        if nonce is None:
            raise InvalidIdTokenError("Nonce is required")

        try:
            signing_key = self._jwks.get_signing_key_from_jwt(id_token)
        except PyJWKClientConnectionError as exc:
            # Apple 側 / ネットワークの一時障害。401 ではなく 503 として扱う。
            logger.warning("Failed to fetch Apple JWKS: %s", type(exc).__name__)
            raise IdentityProviderUnavailableError("Failed to fetch Apple JWKS") from exc
        except PyJWKClientError as exc:
            logger.warning("Failed to resolve Apple signing key: %s", type(exc).__name__)
            raise InvalidIdTokenError("Unable to resolve signing key") from exc
        except jwt.PyJWTError as exc:
            # JWT として読めない入力（"not-a-jwt" 等）は、署名鍵の解決中に DecodeError で落ちる。
            # PyJWKClientError ではないのでここで受け、500 ではなく 401 にする。
            logger.warning("Apple ID token is malformed: %s", type(exc).__name__)
            raise InvalidIdTokenError("Invalid Apple ID token") from exc

        try:
            claims = jwt.decode(
                id_token,
                signing_key.key,
                algorithms=["RS256"],  # alg 混同攻撃の防止
                audience=self._settings.apple_allowed_audiences,
                issuer=self._settings.apple_issuer,  # Apple の iss は 1 値のみ
                leeway=60,  # 端末とサーバの時計ずれ吸収
                options={"require": ["iss", "aud", "exp", "iat", "sub", "nonce"]},
            )
        except jwt.PyJWTError as exc:
            # 元例外のメッセージ・token はログにもレスポンスにも出さない（型名のみ）。
            logger.warning("Apple ID token verification failed: %s", type(exc).__name__)
            raise InvalidIdTokenError("Invalid Apple ID token") from exc

        # nonce: 端末は Apple に `sha256(raw).hexdigest()` を渡し、backend には raw を送る。
        # token の nonce クレームは Apple に渡した値そのものなので、ここで同じ変換をして比較する。
        # raw のままの一致は受け付けない（token が漏れたとき、token の値をそのまま送れば
        # 通ってしまい、リプレイ防止にならないため）。
        # bytes で比較する: str 同士の compare_digest は非 ASCII で TypeError（500）になり、
        # nonce クレームは端末が Apple に渡した任意の文字列でありうる。
        expected = hashlib.sha256(nonce.encode("utf-8")).hexdigest()
        claim = claims["nonce"]
        if not isinstance(claim, str) or not hmac.compare_digest(
            expected.encode("ascii"), claim.lower().encode("utf-8")
        ):
            logger.warning("Apple ID token nonce mismatch")
            raise InvalidIdTokenError("Invalid Apple ID token nonce")

        # `email` はユーザー識別子として使わない（同一性は必ず sub）。表示用の付随情報のみ。
        # 検証済みのときだけ保存する（Apple at Work & School では未検証がありうる）。
        # 非公開リレー（@privaterelay.appleid.com）はそのまま保存する。
        raw_email = claims.get("email")
        email = (
            raw_email
            if isinstance(raw_email, str) and _is_true(claims.get("email_verified"))
            else None
        )

        subject = claims["sub"]
        if not isinstance(subject, str) or not subject:
            logger.warning("Apple ID token has an invalid sub claim")
            raise InvalidIdTokenError("Invalid Apple ID token subject")

        # 検証済みの aud（`jwt.decode` が許可リストと照合済み）。Apple の aud は単一の文字列で、
        # list で来た場合は client_id を一意に決められないので None（= code を交換しない）。
        audience = claims["aud"]

        # Apple は氏名を ID token に入れない。氏名は初回の認可時に端末へ返るだけなので、
        # リクエストの display_name を `UserService` が新規作成時・氏名が未設定のときだけ使う。
        # is_private_email / real_user_status / nonce_supported は使わない。
        return ProviderIdentity(
            provider="apple",
            subject=subject,
            email=email,
            display_name=None,
            photo_url=None,
            audience=audience if isinstance(audience, str) else None,
        )
