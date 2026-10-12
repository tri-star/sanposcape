import uuid

from sqlalchemy.orm import Session

from sanposcape.users.models import User
from sanposcape.users.repository import AppleAuthorizationRepository, UserRepository


class UserService:
    """ユーザーに関するユースケース。

    `auth` ドメインの入口（Google / Apple の ID token 検証 / dev モード、および
    access/refresh トークンからのユーザー引き当て）から呼ばれる。循環 import を避けるため
    `ProviderIdentity` 型は受け取らず、プレーンな引数だけを取る。
    `auth` ドメインは `UserRepository` を直接持たず、常にこの `UserService` を経由して
    `users` ドメインへアクセスする（依存の向きは常に `auth -> users` の一方向、かつ単一の境界）。
    こうしておくことで、将来「退会済み/BAN済みユーザーを弾く」を追加する際に
    `get_by_id()` の1箇所を直せば `get_current_user` と `AuthService.refresh()` の
    双方に効く（SS-12 で想定している choke point）。
    """

    def __init__(
        self,
        db: Session,
        repository: UserRepository,
        apple_authorizations: AppleAuthorizationRepository | None = None,
    ) -> None:
        self._db = db
        self._repository = repository
        self._apple_authorizations = apple_authorizations or AppleAuthorizationRepository(db)

    def get_by_id(self, user_id: uuid.UUID) -> User | None:
        return self._repository.get_by_id(user_id)

    def save_apple_authorization(
        self, user_id: uuid.UUID, *, client_id: str, refresh_token: str
    ) -> None:
        """Apple の refresh token を保存する（削除時の失効用。SS-198）。commit は呼び出し元。"""
        self._apple_authorizations.upsert(user_id, client_id=client_id, refresh_token=refresh_token)

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
        initial_display_name: str | None = None,
    ) -> User:
        """ユーザーを引き当て、無ければ作成する。

        `initial_display_name` は、新規作成時に `display_name`（IdP の ID token の氏名）が
        無い場合に使う。既存ユーザーでは、保存済みの `display_name` が NULL のときだけ補完し、
        非 NULL の値は上書きしない。Apple は氏名を初回の認可時にしか端末へ返さず、2 回目以降は
        端末側に値が無いため、毎回上書きすると消えたり古い値に戻ったりする。一方 NULL の補完は、
        初回のセッション応答を端末が受け取れなかった場合に再送で回復できる。`display_name` に
        詰めて渡すと既存ユーザーにも毎回上書きされるので、必ずこの引数で渡すこと。

        INSERT が競合して先勝ちの行を再取得した場合、後から来た側の
        `initial_display_name` は捨てられる（同一端末の二重送信なので実害は無い）。
        """
        user = self._repository.get_by_provider_subject(provider, subject)
        if user is None:
            return self._repository.create(
                provider=provider,
                provider_subject=subject,
                email=email,
                display_name=display_name if display_name is not None else initial_display_name,
                photo_url=photo_url,
            )

        # 既存ユーザーはプロフィールを最新値で更新する（IdP 側で名前や写真が変わるため）。
        # None は「情報なし」であって「削除」ではないので、既存値を上書きしない。
        if email is not None:
            user.email = email
        if display_name is not None:
            user.display_name = display_name
        elif user.display_name is None and initial_display_name is not None:
            user.display_name = initial_display_name
        if photo_url is not None:
            user.photo_url = photo_url
        self._db.flush()
        return user
