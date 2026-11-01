import hashlib
import logging
import secrets
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from sanposcape.sanpo_maps.exceptions import (
    SanpoMapInvitationLimitError,
    SanpoMapInvitationNotFoundError,
    SanpoMapNotFoundError,
    SanpoMapPermissionDeniedError,
)
from sanposcape.sanpo_maps.invitations.repository import SanpoMapInvitationRepository
from sanposcape.sanpo_maps.invitations.schemas import (
    InvitationPreviewRead,
    InvitationSanpoMapPreviewRead,
    SanpoMapInvitationCreatedRead,
    SanpoMapInvitationListRead,
    SanpoMapInvitationRead,
)
from sanposcape.sanpo_maps.maps.mappers import to_sanpo_map_read
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.maps.schemas import SanpoMapRead
from sanposcape.sanpo_maps.permissions import can_manage_sanpo_map_invitations
from sanposcape.users.models import User

logger = logging.getLogger(__name__)

#: 招待リンクの有効期限（ADR-009 決定39）。
INVITATION_TTL = timedelta(days=7)
#: 地図ごとのメンバー（owner を含む）の上限。家族・友人での共有を想定した値。
SANPO_MAP_MEMBER_LIMIT = 10
#: 地図ごとの有効な招待リンクの上限。
SANPO_MAP_ACTIVE_INVITATION_LIMIT = 10
#: 参加・取り消し・期限切れの招待を消すまでの期間（プライバシーポリシー 6）。
INVITATION_RETENTION = timedelta(days=30)
#: `secrets.token_urlsafe` に渡すバイト数（256 bit）。
_TOKEN_BYTES = 32


def hash_invitation_token(token: str) -> str:
    """DB に保存・照合するトークンのハッシュ（SHA-256 の hex）。トークンそのものは保存しない。"""
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def _utcnow() -> datetime:
    return datetime.now(UTC)


class SanpoMapInvitationService:
    """地図への招待リンクの発行・一覧・取り消し・preview・受諾（SS-250, ADR-009 決定39）。

    他の Service を import・保持・呼び出ししない（ADR-011 M3）。メンバーの判定・地図の行のロックは
    `SanpoMapRepository` を使う。発行・取り消し・受諾は地図の行を `FOR UPDATE` でロックし、
    メンバーを外す（`SanpoMapService.remove_member`）・地図の削除と直列化する。
    トランザクション境界: `list_invitations`・`preview` は読み取りのみ。
    それ以外は自分で commit する。
    """

    def __init__(
        self,
        db: Session,
        repository: SanpoMapInvitationRepository,
        map_repository: SanpoMapRepository,
        *,
        url_base: str,
        now: Callable[[], datetime] = _utcnow,
        token_factory: Callable[[], str] = lambda: secrets.token_urlsafe(_TOKEN_BYTES),
    ) -> None:
        self._db = db
        self._repository = repository
        self._map_repository = map_repository
        self._url_base = url_base
        self._now = now
        self._token_factory = token_factory

    def _require_owner(self, current_user: User, sanpo_map_id: uuid.UUID) -> None:
        """member でなければ 404、owner でなければ 403（決定21 と同じ順）。地図の行をロックする。"""
        membership = self._map_repository.get_membership_for_update(
            user_id=current_user.id, sanpo_map_id=sanpo_map_id
        )
        if membership is None:
            raise SanpoMapNotFoundError()
        _sanpo_map, role = membership
        if not can_manage_sanpo_map_invitations(role):
            raise SanpoMapPermissionDeniedError()

    def create_invitation(
        self, current_user: User, sanpo_map_id: uuid.UUID
    ) -> SanpoMapInvitationCreatedRead:
        """`POST /sanpo-maps/{id}/invitations`。上限はメンバー数 → 有効なリンクの数の順に見る。"""
        actor_user_id = current_user.id
        self._require_owner(current_user, sanpo_map_id)
        now = self._now()
        if self._map_repository.count_members(sanpo_map_id) >= SANPO_MAP_MEMBER_LIMIT:
            raise SanpoMapInvitationLimitError("member_limit_reached")
        if (
            self._repository.count_active(sanpo_map_id=sanpo_map_id, now=now)
            >= SANPO_MAP_ACTIVE_INVITATION_LIMIT
        ):
            raise SanpoMapInvitationLimitError("invitation_limit_exceeded")
        token = self._token_factory()
        invitation = self._repository.create(
            sanpo_map_id=sanpo_map_id,
            created_by_user_id=actor_user_id,
            token_hash=hash_invitation_token(token),
            now=now,
            expires_at=now + INVITATION_TTL,
        )
        created = SanpoMapInvitationCreatedRead(
            id=invitation.id,
            token=token,
            url=f"{self._url_base}#{token}",
            created_at=invitation.created_at,
            expires_at=invitation.expires_at,
        )
        self._db.commit()
        logger.info(
            "Sanpo map invitation created: sanpo_map_id=%s invitation_id=%s by user_id=%s",
            sanpo_map_id,
            created.id,
            actor_user_id,
        )
        return created

    def list_invitations(
        self, current_user: User, sanpo_map_id: uuid.UUID
    ) -> SanpoMapInvitationListRead:
        """`GET /sanpo-maps/{id}/invitations`。有効なものだけ（トークンは返さない）。"""
        membership = self._map_repository.get_membership(
            user_id=current_user.id, sanpo_map_id=sanpo_map_id
        )
        if membership is None:
            raise SanpoMapNotFoundError()
        if not can_manage_sanpo_map_invitations(membership[1]):
            raise SanpoMapPermissionDeniedError()
        rows = self._repository.list_active(sanpo_map_id=sanpo_map_id, now=self._now())
        return SanpoMapInvitationListRead(
            items=[
                SanpoMapInvitationRead(
                    id=row.id, created_at=row.created_at, expires_at=row.expires_at
                )
                for row in rows
            ]
        )

    def revoke_invitation(
        self, current_user: User, sanpo_map_id: uuid.UUID, invitation_id: uuid.UUID
    ) -> None:
        """`DELETE /sanpo-maps/{id}/invitations/{invitation_id}`。
        有効なものだけ取り消せる（他は 404）。
        """
        actor_user_id = current_user.id
        self._require_owner(current_user, sanpo_map_id)
        now = self._now()
        invitation = self._repository.get_active_for_map(
            sanpo_map_id=sanpo_map_id, invitation_id=invitation_id, now=now
        )
        if invitation is None:
            raise SanpoMapInvitationNotFoundError()
        invitation.revoked_at = now
        self._db.commit()
        logger.info(
            "Sanpo map invitation revoked: sanpo_map_id=%s invitation_id=%s by user_id=%s",
            sanpo_map_id,
            invitation_id,
            actor_user_id,
        )

    def preview(self, token: str, current_user: User | None) -> InvitationPreviewRead:
        """`POST /invitations/preview`。使えないトークンは理由を区別せず 404。"""
        row = self._repository.get_active_preview(
            token_hash=hash_invitation_token(token), now=self._now()
        )
        if row is None:
            raise SanpoMapInvitationNotFoundError()
        is_member = current_user is not None and (
            self._map_repository.get_membership(
                user_id=current_user.id, sanpo_map_id=row.sanpo_map.id
            )
            is not None
        )
        return InvitationPreviewRead(
            sanpo_map=InvitationSanpoMapPreviewRead(
                name=row.sanpo_map.name, icon=row.sanpo_map.icon
            ),
            inviter_display_name=row.inviter_display_name,
            expires_at=row.invitation.expires_at,
            membership="member" if is_member else "none",
            sanpo_map_id=row.sanpo_map.id if is_member else None,
        )

    def accept(self, current_user: User, token: str) -> SanpoMapRead:
        """`POST /invitations/accept`。地図の行 → 招待の行の順にロックして有効かを確かめ直す。

        すでにメンバーなら、招待を消費せずに 200 で同じ地図を返す（冪等。owner が自分のリンクを
        開いた場合も含む）。メンバーの上限なら 409。
        """
        actor_user_id = current_user.id
        found = self._repository.find_by_token_hash(hash_invitation_token(token))
        if found is None:
            raise SanpoMapInvitationNotFoundError()
        sanpo_map_id, invitation_id = found.sanpo_map_id, found.id
        sanpo_map = self._map_repository.lock_map_for_update(sanpo_map_id)
        if sanpo_map is None:
            raise SanpoMapInvitationNotFoundError()
        now = self._now()
        invitation = self._repository.get_active_for_update(invitation_id=invitation_id, now=now)
        if invitation is None:
            raise SanpoMapInvitationNotFoundError()

        membership = self._map_repository.get_membership(
            user_id=actor_user_id, sanpo_map_id=sanpo_map_id
        )
        if membership is not None:
            self._db.rollback()
            return to_sanpo_map_read(
                membership[0], role=membership[1], current_user_id=actor_user_id
            )
        if self._map_repository.count_members(sanpo_map_id) >= SANPO_MAP_MEMBER_LIMIT:
            raise SanpoMapInvitationLimitError("member_limit_reached")

        self._map_repository.add_member(
            sanpo_map_id=sanpo_map_id, user_id=actor_user_id, role="editor"
        )
        invitation.accepted_by_user_id = actor_user_id
        invitation.accepted_at = now
        read = to_sanpo_map_read(sanpo_map, role="editor", current_user_id=actor_user_id)
        self._db.commit()
        logger.info(
            "Sanpo map invitation accepted: sanpo_map_id=%s invitation_id=%s by user_id=%s",
            sanpo_map_id,
            invitation_id,
            actor_user_id,
        )
        return read

    def purge_stale(self) -> int:
        """参加・取り消し・期限切れから 30 日を過ぎた招待を消す（日次の Lambda から呼ぶ）。"""
        deleted = self._repository.purge_stale(now=self._now(), retention=INVITATION_RETENTION)
        self._db.commit()
        return deleted
