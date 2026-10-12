from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class ProviderIdentity:
    """外部 identity provider から検証済みで得られたユーザー情報。"""

    provider: str  # "google" / "apple"
    subject: str  # IdP 内で不変のユーザー ID（Google / Apple の sub）
    email: str | None
    display_name: str | None
    photo_url: str | None
    # 検証済みの aud。Apple の code 交換の client_id（= bundle ID）に使う（SS-198）。
    # 検証した token から読むので、リクエストの値は使わない。Apple 以外・取れないときは None。
    audience: str | None = None


class IdentityProvider(Protocol):
    name: str

    def verify(self, id_token: str, *, nonce: str | None = None) -> ProviderIdentity:
        """ID token を検証し、`ProviderIdentity` を返す。

        `nonce` は端末が生成した raw 値。検証方法は provider ごとに異なる
        （Apple は SHA256 の hex を ID token の nonce クレームと比較する。Google は検証しない）。

        検証に失敗した場合は `sanposcape.auth.exceptions.InvalidIdTokenError` を送出する
        （ID token 自体が不正・期限切れ・署名不一致など、トークン起因の失敗。401 に変換される）。

        これとは別に、JWKS 取得など IdP との通信が一時的に失敗した場合は
        `sanposcape.auth.exceptions.IdentityProviderUnavailableError` を送出し得る
        （503 に変換される）。実装者（Apple 等の追加実装を含む）はこの2つを区別し、
        「トークンが悪い」のか「IdP と話せなかっただけ」のかを呼び出し元が判別できるようにすること。
        """
        ...
