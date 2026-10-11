"""Google ID token（OIDC）の検証。

JWKS の取得・キャッシュは `PyJWKClient` に任せる。テストでは `jwks_client` を
DI で差し替え、ネットワークに一切出ずに検証ロジックをテストする（§11.2）。
"""

import logging

import jwt
from jwt.exceptions import PyJWKClientConnectionError, PyJWKClientError

from sanposcape.auth.exceptions import IdentityProviderUnavailableError, InvalidIdTokenError
from sanposcape.auth.providers.base import ProviderIdentity
from sanposcape.auth.providers.jwks import JWKSClientProtocol, get_jwks_client
from sanposcape.config import Settings

logger = logging.getLogger(__name__)


class GoogleIdentityProvider:
    name = "google"

    def __init__(self, settings: Settings, jwks_client: JWKSClientProtocol | None = None) -> None:
        self._settings = settings
        self._jwks = jwks_client or get_jwks_client(
            settings.google_jwks_url, settings.google_jwks_cache_lifespan_seconds
        )

    def verify(self, id_token: str, *, nonce: str | None = None) -> ProviderIdentity:
        try:
            signing_key = self._jwks.get_signing_key_from_jwt(id_token)
        except PyJWKClientConnectionError as exc:
            # Google 側 / ネットワークの一時障害。401 ではなく 503 として扱う。
            logger.warning("Failed to fetch Google JWKS: %s", type(exc).__name__)
            raise IdentityProviderUnavailableError("Failed to fetch Google JWKS") from exc
        except PyJWKClientError as exc:
            # kid が JWK Set に存在しない等（1回の自動再取得後も見つからない）→ 不正トークン扱い
            logger.warning("Failed to resolve Google signing key: %s", type(exc).__name__)
            raise InvalidIdTokenError("Unable to resolve signing key") from exc
        except jwt.PyJWTError as exc:
            # JWT として読めない入力は、署名鍵の解決中に DecodeError で落ちる。
            # PyJWKClientError ではないのでここで受け、500 ではなく 401 にする。
            logger.warning("Google ID token is malformed: %s", type(exc).__name__)
            raise InvalidIdTokenError("Invalid Google ID token") from exc

        try:
            claims = jwt.decode(
                id_token,
                signing_key.key,
                algorithms=["RS256"],  # alg 混同攻撃（"none" / HS256 なりすまし）の防止
                audience=self._settings.google_allowed_audiences,
                leeway=60,  # 端末とサーバの時計ずれ吸収
                options={
                    # issuer は "https://accounts.google.com" / "accounts.google.com" の
                    # 2 値があり得るため、ここでは検証を無効化して自前でリストと突き合わせる。
                    "verify_iss": False,
                    "require": ["iss", "aud", "exp", "iat", "sub"],
                },
            )
        except jwt.PyJWTError as exc:
            # 元例外のメッセージはレスポンスに載せない（内部情報の漏洩防止）。ログには残す。
            logger.warning("Google ID token verification failed: %s", type(exc).__name__)
            raise InvalidIdTokenError("Invalid Google ID token") from exc

        if claims["iss"] not in self._settings.google_allowed_issuers:
            logger.warning("Google ID token issuer not allowed: %s", claims["iss"])
            raise InvalidIdTokenError("Invalid Google ID token issuer")

        # `azp` は検証しない: ネイティブサインインでは aud = Web クライアント ID、
        # azp = 実プラットフォーム別クライアント ID になり得るため、固定値比較は
        # Android/iOS のどちらかを必ず弾いてしまう。許容 audience のリスト検証で十分。
        #
        # `email` はユーザー識別子として使わない（同一性は必ず sub）。表示用の付随情報のみ。
        #
        # TODO: nonce は検証しない（`nonce` 引数は受けて無視する。モバイル側が送らないため）。
        # Apple は検証している。Google も端末が nonce を渡すようになったら同じ方式で検証する。
        # ID token の有効期間内のリプレイは理論上可能だが、盗まれた時点で他の攻撃も成立するため
        # MVP では許容する。将来のハードニング項目。
        return ProviderIdentity(
            provider="google",
            subject=claims["sub"],
            email=claims.get("email"),
            display_name=claims.get("name"),
            photo_url=claims.get("picture"),
        )
