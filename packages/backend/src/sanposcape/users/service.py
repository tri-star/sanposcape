import logging
import uuid

from sqlalchemy.orm import Session

from sanposcape.integrations.apple.client import AppleSignInClient
from sanposcape.integrations.apple.exceptions import (
    AppleSignInClientSecretError,
    AppleSignInError,
    AppleSignInNotConfiguredError,
    AppleSignInRejectedError,
    AppleSignInUnavailableError,
)
from sanposcape.sanpo_maps.photos.account_purge import AccountPhotoPurgeScheduler
from sanposcape.users.exceptions import AccountDeletionUnavailableError
from sanposcape.users.models import User
from sanposcape.users.repository import AppleAuthorizationRepository, UserRepository

logger = logging.getLogger(__name__)


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


class AccountDeletionService:
    """アカウント削除のユースケース（SS-198）。Apple ユーザーは削除の前にトークンを失効させる。

    Apple は Sign in with Apple を使うアプリに、アカウント削除時の失効を求めている。順序:

    1. Apple ユーザーのときだけ `apple_authorizations` を読む（Google / dev は読まない。
       テーブルが無い migrate 前の空白で、Google ユーザーの削除を壊さないため）。
    2. token があれば `commit()` で読み取りだけのトランザクションを閉じる。外部 HTTP の間に
       DB の接続（Neon の pooled 接続）を握らないため。変更は無いので何も書かれない。
    3. Apple の `/auth/revoke` で失効させる。
    4. 写真の削除を予約し（`AccountPhotoPurgeScheduler`。S3 の写真は保持期間の後に
       バックグラウンドで消す。SS-109 / ADR-009 決定36）、`UserService.delete_current_user`
       で利用者を消す（CASCADE で `apple_authorizations` も消える）。予約と削除は同じ
       commit に乗る。

    失効の結果ごとの扱い:

    - 成功 → 削除へ進む。
    - 一時障害（タイムアウト・接続失敗・5xx・429・408・425・想定外の応答）→ **削除せず**
      `AccountDeletionUnavailableError`（503）。token が残るので、ユーザーの再試行で失効まで
      完了できる（Apple の失効は冪等）。
    - 恒久的な拒否（`invalid_grant` 等）・設定ミス・鍵の未設定 → 削除へ進む（ログに残す。
      再試行しても直らず、削除できない状態の方がアカウント削除の要件上まずい）。
      `invalid_grant` だけが WARNING。それ以外の拒否・client secret の生成失敗・未設定は
      ERROR（運用者が直す）。
    - Apple ユーザーだが token が無い → 削除へ進む（INFO。失効の手段が無い）。

    再試行はしない。失効の後に DB の削除が失敗しても、再試行で失効は冪等に成功して削除へ進む。
    競合:

    - 読んだ後・削除の前に別端末で再サインインされると、新しい token は失効されずに CASCADE で
      消える（受け入れる。ADR-002 の SS-198 追補）。ロックを握ったまま外部 HTTP をしない方を
      優先する。
    - 失効している間に同じユーザーが別のリクエストで先に削除された場合は、失効後にユーザーを
      読み直し、既に無ければ何もせず成功（204）とする（冪等）。
    """

    def __init__(
        self,
        db: Session,
        user_service: UserService,
        apple_authorizations: AppleAuthorizationRepository,
        apple_sign_in_client: AppleSignInClient,
        photo_purges: AccountPhotoPurgeScheduler,
    ) -> None:
        self._db = db
        self._user_service = user_service
        self._apple_authorizations = apple_authorizations
        self._apple_sign_in_client = apple_sign_in_client
        self._photo_purges = photo_purges

    def delete_account(self, user: User) -> None:
        # commit で属性が期限切れになり再読み込み（= 新しいトランザクション）が走るので、
        # 先に素の値として控える。
        user_id = user.id
        revocation = self._read_revocation_target(user)
        if revocation is not None:
            client_id, refresh_token = revocation
            self._db.commit()
            self._revoke(refresh_token, client_id=client_id)
            # 失効の間（外部 HTTP の間）に、別のリクエストが同じユーザーを削除したかもしれない。
            # 期限切れのままの `user` を削除しようとすると `ObjectDeletedError`（500）になる。
            current = self._user_service.get_by_id(user_id)
            if current is None:
                return
            user = current
        self._photo_purges.schedule(user_id)
        self._user_service.delete_current_user(user)

    def _read_revocation_target(self, user: User) -> tuple[str, str] | None:
        if user.provider != "apple":
            return None
        authorization = self._apple_authorizations.get(user.id)
        if authorization is None:
            logger.info(
                "Apple user has no stored refresh token; deleting without revoking "
                "(created before token storage, or the code exchange failed)"
            )
            return None
        return authorization.client_id, authorization.refresh_token

    def _revoke(self, refresh_token: str, *, client_id: str) -> None:
        try:
            self._apple_sign_in_client.revoke_refresh_token(refresh_token, client_id=client_id)
        except AppleSignInNotConfiguredError:
            logger.error(
                "Apple sign-in key is not configured; deleting the account without "
                "revoking its Apple token"
            )
        except AppleSignInClientSecretError as exc:
            logger.error("%s; deleting the account without revoking its Apple token", exc)
        except AppleSignInRejectedError as exc:
            # invalid_grant（token が既に無効）だけが想定内。それ以外は設定ミスや想定外の拒否。
            logger.log(
                logging.WARNING if exc.is_expected_rejection else logging.ERROR,
                "Apple rejected the token revocation: %s (HTTP %s); deleting the account anyway",
                exc.error_code,
                exc.status_code,
            )
        except AppleSignInUnavailableError as exc:
            logger.warning("Apple token revocation failed: %s", exc.reason)
            raise AccountDeletionUnavailableError from exc
        except AppleSignInError as exc:
            logger.warning("Apple token revocation failed: %s", type(exc).__name__)
            raise AccountDeletionUnavailableError from exc
