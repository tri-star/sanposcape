import logging
from functools import lru_cache

from sanposcape.auth.providers.apple import AppleIdentityProvider
from sanposcape.auth.providers.base import IdentityProvider
from sanposcape.auth.providers.google import GoogleIdentityProvider
from sanposcape.config import Settings

logger = logging.getLogger(__name__)


def build_identity_providers(settings: Settings) -> dict[str, IdentityProvider]:
    """有効な identity provider のレジストリを組み立てる。

    provider 実装を追加してここに足す。ただし ID token 以外の入力（Apple の nonce・氏名）を
    受け渡すため、`AuthService` / router / schemas も provider 追加の影響を受ける
    （ADR-002 SS-195 追補が「決定2 の下流無変更から外れる」と書いている点）。

    Apple は `APPLE_ALLOWED_AUDIENCES` が空なら登録しない。このとき
    `provider="apple"` は `UnsupportedProviderError`（400）になり、
    「トークンが悪い」（401）と「サーバ未設定」を端末側で区別できる。
    """
    providers: dict[str, IdentityProvider] = {"google": GoogleIdentityProvider(settings)}
    if settings.apple_allowed_audiences:
        providers["apple"] = AppleIdentityProvider(settings)
    return providers


@lru_cache(maxsize=1)
def warn_apple_disabled_once() -> None:
    """Apple が未設定であることを、プロセスにつき 1 回だけ WARNING で知らせる。

    `build_identity_providers` はリクエストごとに呼ばれ、未認証の入力でログ量を増やせて
    しまうため、そこには副作用を持たせない。呼び出し側が未登録を見て呼ぶ。
    テストでは `cache_clear()` で状態を戻す。
    """
    logger.warning("APPLE_ALLOWED_AUDIENCES is empty; Sign in with Apple is disabled")
