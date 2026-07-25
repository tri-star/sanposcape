from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class ProviderIdentity:
    """外部 identity provider から検証済みで得られたユーザー情報。"""

    provider: str  # "google" / 将来 "apple"
    subject: str  # IdP 内で不変のユーザー ID（Google の sub）
    email: str | None
    display_name: str | None
    photo_url: str | None


class IdentityProvider(Protocol):
    name: str

    def verify(self, id_token: str) -> ProviderIdentity:
        """ID token を検証し、`ProviderIdentity` を返す。

        検証に失敗した場合は `sanposcape.auth.exceptions.InvalidIdTokenError` を送出する
        （ID token 自体が不正・期限切れ・署名不一致など、トークン起因の失敗。401 に変換される）。

        これとは別に、JWKS 取得など IdP との通信が一時的に失敗した場合は
        `sanposcape.auth.exceptions.IdentityProviderUnavailableError` を送出し得る
        （503 に変換される）。実装者（Apple 等の追加実装を含む）はこの2つを区別し、
        「トークンが悪い」のか「IdP と話せなかっただけ」のかを呼び出し元が判別できるようにすること。
        """
        ...
