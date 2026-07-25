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

        検証に失敗した場合は `sanposcape.auth.exceptions.InvalidIdTokenError` を送出する。
        """
        ...
