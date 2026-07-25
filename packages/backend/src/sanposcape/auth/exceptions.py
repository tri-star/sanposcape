class AuthenticationError(Exception):
    """auth ドメインの例外の基底クラス。"""


class InvalidIdTokenError(AuthenticationError):
    """Google 等の IdP から受け取った ID token の検証に失敗した。"""


class InvalidAccessTokenError(AuthenticationError):
    """自前 access token の検証に失敗した。"""


class InvalidRefreshTokenError(AuthenticationError):
    """refresh token が未知・失効・期限切れである。"""


class RefreshTokenReuseDetectedError(AuthenticationError):
    """既に使用済み/失効済みの refresh token が再送された（再利用検知）。"""


class UnsupportedProviderError(AuthenticationError):
    """未対応の identity provider が指定された。"""

    def __init__(self, provider: str) -> None:
        super().__init__(f"Unsupported provider: {provider}")
        self.provider = provider


class IdentityProviderUnavailableError(AuthenticationError):
    """JWKS 取得など、IdP との通信に一時的に失敗した（503 相当）。"""
