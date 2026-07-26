import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from sanposcape.users.models import User


class UserRepository:
    """users テーブルへの DB アクセスを隔離する層。"""

    def __init__(self, db: Session) -> None:
        self._db = db

    def get_by_id(self, user_id: uuid.UUID) -> User | None:
        return self._db.get(User, user_id)

    def get_by_provider_subject(self, provider: str, provider_subject: str) -> User | None:
        stmt = select(User).where(
            User.provider == provider,
            User.provider_subject == provider_subject,
        )
        return self._db.scalars(stmt).first()

    def delete(self, user: User) -> None:
        """ユーザーを削除する。

        `refresh_tokens.user_id` の ON DELETE CASCADE により、紐づく refresh token も
        同じトランザクションで削除される。commit はユースケース境界の service が担う。
        """
        self._db.delete(user)
        self._db.flush()

    def create(
        self,
        *,
        provider: str,
        provider_subject: str,
        email: str | None,
        display_name: str | None,
        photo_url: str | None,
    ) -> User:
        """新規ユーザーを作成する。

        `get_by_provider_subject()` での存在確認 → 無ければ INSERT、という呼び出し元
        （`UserService.find_or_create`）の check-then-act は、同時に2本同じ `(provider,
        provider_subject)` で走ると両方が「未登録」と判定してしまう競合を持つ。
        `UniqueConstraint("provider", "provider_subject")` により片方は `IntegrityError`
        になるため、ここで savepoint（`db.begin_nested()`）を使って捕捉し、先に勝った方の
        行を再取得して返す（insert → on conflict → re-select）。

        `db.begin_nested()` を使う理由: 素の `db.rollback()` は呼び出し元が張っている
        外側のトランザクション全体を巻き戻してしまい、`/auth/session` の中で同じトランザクション
        上で行われる他の処理（例: `_issue_session` の refresh token 発行）まで破壊する。
        savepoint なら、この INSERT だけをロールバックして外側のトランザクションは継続できる。
        """
        user = User(
            provider=provider,
            provider_subject=provider_subject,
            email=email,
            display_name=display_name,
            photo_url=photo_url,
        )
        try:
            with self._db.begin_nested():
                self._db.add(user)
                self._db.flush()
        except IntegrityError:
            # 競合相手が先に INSERT を確定させた。savepoint 内の変更のみ巻き戻り済みなので、
            # 外側のトランザクションを壊さずに再取得できる。
            existing = self.get_by_provider_subject(provider, provider_subject)
            if existing is None:
                # 一意制約違反なのに再取得できない状況は理論上あり得ないはずだが、
                # 万一に備えて元の例外を再送出する（サイレントな不整合より500の方が安全）。
                raise
            return existing
        self._db.refresh(user)
        return user
