"""IdP 共通の JWKS クライアント（プロセス内キャッシュ）。"""

from functools import lru_cache
from typing import Protocol

from jwt import PyJWKClient


class SigningKey(Protocol):
    key: object


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
