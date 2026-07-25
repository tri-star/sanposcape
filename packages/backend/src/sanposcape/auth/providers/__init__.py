from sanposcape.auth.providers.base import IdentityProvider
from sanposcape.auth.providers.google import GoogleIdentityProvider
from sanposcape.config import Settings


def build_identity_providers(settings: Settings) -> dict[str, IdentityProvider]:
    """有効な identity provider のレジストリを組み立てる。

    Apple 等を追加する場合は provider 実装を追加してここに 1 行足すだけでよい
    （`AuthService` / router / tokens / `get_current_user` は無変更のまま）。
    """
    return {"google": GoogleIdentityProvider(settings)}
