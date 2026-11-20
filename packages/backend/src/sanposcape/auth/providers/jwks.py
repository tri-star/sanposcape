"""IdP 共通の JWKS クライアント（プロセス内キャッシュ）。"""

from functools import lru_cache
from typing import TYPE_CHECKING, Protocol

from jwt import PyJWKClient

if TYPE_CHECKING:
    # pyjwt[crypto] のときだけ公開鍵の型の union になる（crypto が無いと Never）
    from jwt.algorithms import AllowedPublicKeys


class SigningKey(Protocol):
    # `jwt.decode()` に渡せる鍵の型。読み取り専用（property）にして、`PyJWK.key` のような
    # より狭い型の属性を持つ実装も満たせるようにする（可変の属性は Protocol で不変になる）
    @property
    def key(self) -> "AllowedPublicKeys | str | bytes": ...


class JWKSClientProtocol(Protocol):
    """`PyJWKClient` のうち、provider が使う部分だけを表す最小インターフェース。"""

    def get_signing_key_from_jwt(self, token: str) -> SigningKey: ...


# maxsize は IdP の数以上にする。Google と Apple が同じ関数を共有するため、1 のままだと
# 交互のリクエストで互いのクライアントを追い出し、毎回 JWKS を HTTP 取得してしまう
# （テストでは気づけない）。
@lru_cache(maxsize=4)
def get_jwks_client(uri: str, lifespan: int) -> PyJWKClient:
    """プロセス内シングルトンの JWKS クライアント。

    リクエストごとに生成すると JWKS キャッシュが一切効かず、毎回 IdP に
    HTTP が飛んでしまう（レビュー時の落とし穴）。`timeout=5` は必須
    （未指定だと既定 30 秒でワーカーが詰まる）。
    """
    return PyJWKClient(uri, cache_jwk_set=True, lifespan=lifespan, cache_keys=True, timeout=5)
