import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    PrimaryKeyConstraint,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from sanposcape.database import Base

#: `SanpoMapMember.role` に許容する値。owner も member 行を持つ（招待機能への備え。
#: `sanpo_maps/permissions.py` 参照）。
SANPO_MAP_ROLES = ("owner", "editor")


class SanpoMap(Base):
    """ピンの入れ物となる「地図」。

    `User` 側には意図して `relationship()` を追加しない（`Walk` と同じ理由。
    `ON DELETE CASCADE` 前提のアカウント削除を壊さないため、ADR-003 決定7）。
    子テーブル（`pins` 等）への relationship も張らず、repository で明示クエリする
    （folder-structure.md「迷う箇所を作らない」方針）。

    `is_default` は「owner ごとに既定地図は1つ」を部分一意インデックスで守る。
    `sanpo_map_members` に owner の行も別途持つのは冗長だが、地図単体からオーナーを
    引ける形を残すため（B-D1〜B-D2、backend-plan.md 5.2）。
    """

    __tablename__ = "sanpo_maps"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(50))
    is_default: Mapped[bool] = mapped_column(default=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # ピン追加のたびに更新する（「最近使った地図」を先頭にする並び順に使う。5.3 (1)）。
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_sanpo_maps_owner_user_id", "owner_user_id"),
        # 部分一意インデックス: owner ごとに is_default=true の行はちょうど1つ。
        Index(
            "uq_sanpo_maps_owner_user_id_is_default",
            "owner_user_id",
            unique=True,
            postgresql_where=text("is_default"),
        ),
    )


class SanpoMapMember(Base):
    """地図のメンバーシップ・権限（role）。owner も member 行を持つ（不変条件）。"""

    __tablename__ = "sanpo_map_members"

    sanpo_map_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sanpo_maps.id", ondelete="CASCADE")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    role: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        PrimaryKeyConstraint("sanpo_map_id", "user_id", name="pk_sanpo_map_members"),
        CheckConstraint(f"role IN {SANPO_MAP_ROLES}", name="ck_sanpo_map_members_role"),
        Index("ix_sanpo_map_members_user_id", "user_id"),
    )
