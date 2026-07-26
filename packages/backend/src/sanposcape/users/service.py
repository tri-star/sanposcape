import uuid

from sqlalchemy.orm import Session

from sanposcape.users.models import User
from sanposcape.users.repository import UserRepository


class UserService:
    """ユーザーに関するユースケース。

    `auth` ドメインの入口（Google ID token 検証 / dev モード、および access/refresh
    トークンからのユーザー引き当て）から呼ばれる。循環 import を避けるため
    `ProviderIdentity` 型は受け取らず、プレーンな引数だけを取る。
    `auth` ドメインは `UserRepository` を直接持たず、常にこの `UserService` を経由して
    `users` ドメインへアクセスする（依存の向きは常に `auth -> users` の一方向、かつ単一の境界）。
    こうしておくことで、将来「退会済み/BAN済みユーザーを弾く」を追加する際に
    `get_by_id()` の1箇所を直せば `get_current_user` と `AuthService.refresh()` の
    双方に効く（SS-12 で想定している choke point）。
    """

    def __init__(self, db: Session, repository: UserRepository) -> None:
        self._db = db
        self._repository = repository

    def get_by_id(self, user_id: uuid.UUID) -> User | None:
        return self._repository.get_by_id(user_id)

    def delete_current_user(self, current_user: User) -> None:
        """認証済み本人のアカウントとセッション情報を削除する。"""
        self._repository.delete(current_user)
        self._db.commit()

    def find_or_create(
        self,
        *,
        provider: str,
        subject: str,
        email: str | None,
        display_name: str | None,
        photo_url: str | None,
    ) -> User:
        user = self._repository.get_by_provider_subject(provider, subject)
        if user is None:
            return self._repository.create(
                provider=provider,
                provider_subject=subject,
                email=email,
                display_name=display_name,
                photo_url=photo_url,
            )

        # 既存ユーザーはプロフィールを最新値で更新する（IdP 側で名前や写真が変わるため）。
        # None は「情報なし」であって「削除」ではないので、既存値を上書きしない。
        if email is not None:
            user.email = email
        if display_name is not None:
            user.display_name = display_name
        if photo_url is not None:
            user.photo_url = photo_url
        self._db.flush()
        return user
