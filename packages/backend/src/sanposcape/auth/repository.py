import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from sanposcape.auth.models import RefreshToken


class RefreshTokenRepository:
    """refresh_tokens テーブルへの DB アクセスを隔離する層。"""

    def __init__(self, db: Session) -> None:
        self._db = db

    def get_by_hash_for_update(self, token_hash: str) -> RefreshToken | None:
        """token_hash で1行をロックして取得する。

        同時 refresh リクエストが互いを再利用と誤検知しないよう、
        呼び出し元のトランザクション内で `FOR UPDATE` の行ロックを取る。
        """
        stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash).with_for_update()
        return self._db.scalars(stmt).first()

    def create(
        self,
        *,
        user_id: uuid.UUID,
        token_hash: str,
        family_id: uuid.UUID,
        expires_at: datetime,
    ) -> RefreshToken:
        row = RefreshToken(
            user_id=user_id,
            token_hash=token_hash,
            family_id=family_id,
            expires_at=expires_at,
        )
        self._db.add(row)
        self._db.flush()
        self._db.refresh(row)
        return row

    def revoke_family(self, family_id: uuid.UUID, reason: str, now: datetime) -> None:
        stmt = (
            update(RefreshToken)
            .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now, revoked_reason=reason)
        )
        self._db.execute(stmt)

    def mark_used(self, row: RefreshToken, now: datetime) -> None:
        row.used_at = now
        self._db.flush()

    def revoke(self, row: RefreshToken, reason: str, now: datetime) -> None:
        row.revoked_at = now
        row.revoked_reason = reason
        self._db.flush()
