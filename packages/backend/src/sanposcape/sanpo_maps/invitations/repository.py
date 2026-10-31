import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import and_, delete, func, select
from sqlalchemy.orm import Session

from sanposcape.sanpo_maps.models import SanpoMap, SanpoMapInvitation
from sanposcape.users.models import User


@dataclass(frozen=True)
class InvitationPreviewRow:
    """`get_active_preview()` の1行。`inviter_display_name` は作った人の `users.display_name`。"""

    invitation: SanpoMapInvitation
    sanpo_map: SanpoMap
    inviter_display_name: str | None


def _active_condition(now: datetime):
    """有効な招待 = 未使用・未取り消し・期限内（ADR-009 決定39）。"""
    return and_(
        SanpoMapInvitation.accepted_at.is_(None),
        SanpoMapInvitation.revoked_at.is_(None),
        SanpoMapInvitation.expires_at > now,
    )


class SanpoMapInvitationRepository:
    """sanpo_map_invitations への DB アクセス（SS-250, ADR-009 決定39）。

    地図の ID を受け取るメソッドは、呼び出し側が owner の判定（`SanpoMapRepository.
    get_membership_for_update()`）を済ませた**認可済みの ID**を受け取る。トークンで引くメソッドは、
    トークンのハッシュそのものが認可になる（推測できない 256 bit の乱数）。
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    def count_active(self, *, sanpo_map_id: uuid.UUID, now: datetime) -> int:
        stmt = select(func.count()).where(
            SanpoMapInvitation.sanpo_map_id == sanpo_map_id, _active_condition(now)
        )
        return int(self._db.scalar(stmt) or 0)

    def create(
        self,
        *,
        sanpo_map_id: uuid.UUID,
        created_by_user_id: uuid.UUID,
        token_hash: str,
        now: datetime,
        expires_at: datetime,
    ) -> SanpoMapInvitation:
        invitation = SanpoMapInvitation(
            sanpo_map_id=sanpo_map_id,
            created_by_user_id=created_by_user_id,
            token_hash=token_hash,
            created_at=now,
            expires_at=expires_at,
        )
        self._db.add(invitation)
        self._db.flush()
        return invitation

    def list_active(self, *, sanpo_map_id: uuid.UUID, now: datetime) -> list[SanpoMapInvitation]:
        stmt = (
            select(SanpoMapInvitation)
            .where(SanpoMapInvitation.sanpo_map_id == sanpo_map_id, _active_condition(now))
            .order_by(SanpoMapInvitation.created_at.desc(), SanpoMapInvitation.id.desc())
        )
        return list(self._db.scalars(stmt))

    def get_active_for_map(
        self, *, sanpo_map_id: uuid.UUID, invitation_id: uuid.UUID, now: datetime
    ) -> SanpoMapInvitation | None:
        stmt = select(SanpoMapInvitation).where(
            SanpoMapInvitation.id == invitation_id,
            SanpoMapInvitation.sanpo_map_id == sanpo_map_id,
            _active_condition(now),
        )
        return self._db.scalars(stmt).first()

    def get_active_preview(self, *, token_hash: str, now: datetime) -> InvitationPreviewRow | None:
        stmt = (
            select(SanpoMapInvitation, SanpoMap, User.display_name)
            .join(SanpoMap, SanpoMap.id == SanpoMapInvitation.sanpo_map_id)
            .join(User, User.id == SanpoMapInvitation.created_by_user_id)
            .where(SanpoMapInvitation.token_hash == token_hash, _active_condition(now))
        )
        row = self._db.execute(stmt).first()
        if row is None:
            return None
        return InvitationPreviewRow(
            invitation=row[0], sanpo_map=row[1], inviter_display_name=row[2]
        )

    def find_by_token_hash(self, token_hash: str) -> SanpoMapInvitation | None:
        """状態を問わずトークンのハッシュで引く（受諾で、
        地図の行をロックする前に地図 ID を知るため）。
        """
        stmt = select(SanpoMapInvitation).where(SanpoMapInvitation.token_hash == token_hash)
        return self._db.scalars(stmt).first()

    def get_active_for_update(
        self, *, invitation_id: uuid.UUID, now: datetime
    ) -> SanpoMapInvitation | None:
        """地図の行をロックした後に、招待の行もロックして有効かを確かめ直す（受諾の競合対策）。"""
        stmt = (
            select(SanpoMapInvitation)
            .where(SanpoMapInvitation.id == invitation_id, _active_condition(now))
            .with_for_update()
        )
        return self._db.scalars(stmt).first()

    def purge_stale(self, *, now: datetime, retention: timedelta) -> int:
        """参加・取り消し・期限切れから `retention` を過ぎた招待を消す
        （プライバシーポリシー 6）。
        """
        ended_at = func.coalesce(
            SanpoMapInvitation.accepted_at,
            SanpoMapInvitation.revoked_at,
            SanpoMapInvitation.expires_at,
        )
        result = self._db.execute(delete(SanpoMapInvitation).where(ended_at < now - retention))
        return int(result.rowcount or 0)
