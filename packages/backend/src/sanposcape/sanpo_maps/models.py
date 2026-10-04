import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from sanposcape.database import Base

#: `SanpoMapMember.role` に許容する値。owner も member 行を持つ（招待機能への備え。
#: `sanpo_maps/permissions.py` 参照）。
SANPO_MAP_ROLES = ("owner", "editor")


class SanpoMapIcon(StrEnum):
    """地図のアイコン（`SanpoMap.icon` の値域。SS-171, ADR-009 決定31）。

    値はドメインの語（Lucide のアイコン名ではない）。mobile が対応表でグリフと色に変換する。
    値を足すときは `ck_sanpo_maps_icon` を作り直すマイグレーションが要る。
    """

    PIN = "pin"
    TREE = "tree"
    FLOWER = "flower"
    COFFEE = "coffee"
    FOOD = "food"
    BAKERY = "bakery"
    LANDMARK = "landmark"
    CAMERA = "camera"
    BOOK = "book"
    HEART = "heart"
    SHOPPING = "shopping"
    DOG = "dog"


#: 地図のアイコンの既定値（既存の地図と、`POST /pins` が自動作成する「最初の地図」, 決定31）。
DEFAULT_SANPO_MAP_ICON = SanpoMapIcon.PIN

#: `SanpoMap.icon` に許容する値（CHECK 制約の組み立てに使うため、要素は素の `str`）。
SANPO_MAP_ICONS = tuple(icon.value for icon in SanpoMapIcon)

#: `PinPhotoUpload.status` に許容する値。
PIN_PHOTO_UPLOAD_STATUSES = ("pending", "attached")


class SanpoMap(Base):
    """ピンの入れ物となる「地図」。

    `User` 側には意図して `relationship()` を追加しない（`Walk` と同じ理由。
    `ON DELETE CASCADE` 前提のアカウント削除を壊さないため、ADR-003 決定7）。
    子テーブル（`pins` 等）への relationship も張らず、repository で明示クエリする
    （folder-structure.md「迷う箇所を作らない」方針）。

    `is_default` は「owner ごとに既定地図は1つ」を部分一意インデックスで守る。
    `sanpo_map_members` に owner の行も別途持つのは冗長だが、地図単体からオーナーを
    引ける形を残すため（B-D1〜B-D2、backend-plan.md 5.2）。

    `icon` は既定 pin（決定31）。`updated_at` はアイコンの変更では動かさない。
    """

    __tablename__ = "sanpo_maps"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(50))
    # 地図のアイコン（SS-171, ADR-009 決定31）。ピンの見た目は属する地図のアイコンで決まる。
    icon: Mapped[str] = mapped_column(
        String(16),
        default=DEFAULT_SANPO_MAP_ICON.value,
        server_default=DEFAULT_SANPO_MAP_ICON.value,
    )
    is_default: Mapped[bool] = mapped_column(default=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # ピン追加のたびに更新する（「最近使った地図」を先頭にする並び順に使う。5.3 (1)）。
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint(f"icon IN {SANPO_MAP_ICONS}", name="ck_sanpo_maps_icon"),
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


class Pin(Base):
    """地図（`SanpoMap`）に登録された1件の地点。

    `User` / `SanpoMap` 側には意図して `relationship()` を追加しない（`Walk` と同じ理由。
    ADR-003 決定7）。子テーブル（`pin_photos`/`pin_tags`）への relationship も張らない。
    """

    __tablename__ = "pins"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sanpo_map_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sanpo_maps.id", ondelete="CASCADE")
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    # 冪等キー（mobile が登録開始時に採番する UUID）。同一 (created_by_user_id,
    # client_pin_id) の再送は同じ行を返す（walks/models.py の client_walk_id と同じ形）。
    client_pin_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    name: Mapped[str | None] = mapped_column(String(50), default=None)
    memo: Mapped[str | None] = mapped_column(Text, default=None)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    # FK ではない紐付けキー（散歩は登録時点で未保存のことがあるため）。
    client_walk_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint(
            "created_by_user_id", "client_pin_id", name="uq_pins_created_by_user_id_client_pin_id"
        ),
        Index("ix_pins_sanpo_map_id_created_at_id", "sanpo_map_id", "created_at", "id"),
    )


class PinPhoto(Base):
    """ピンに紐づく写真1枚。`width`/`height`/`byte_size` はサーバーがデコードした実寸・実サイズ。

    `thumbnail_*` は NULL 許容にしてある（B-D20: 現在は確定時に同期生成するため常に
    埋まるが、将来サムネイルを非同期生成に変える場合に列追加なしで「生成待ち」を
    表現できるようにするため）。
    """

    __tablename__ = "pin_photos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pin_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pins.id", ondelete="CASCADE")
    )
    uploaded_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    upload_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    s3_key: Mapped[str] = mapped_column(String(512))
    content_type: Mapped[str] = mapped_column(String(64))
    byte_size: Mapped[int] = mapped_column(Integer)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    thumbnail_s3_key: Mapped[str | None] = mapped_column(String(512), default=None)
    thumbnail_byte_size: Mapped[int | None] = mapped_column(Integer, default=None)
    thumbnail_width: Mapped[int | None] = mapped_column(Integer, default=None)
    thumbnail_height: Mapped[int | None] = mapped_column(Integer, default=None)
    position: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("upload_id", name="uq_pin_photos_upload_id"),
        UniqueConstraint("s3_key", name="uq_pin_photos_s3_key"),
        Index("ix_pin_photos_pin_id_position", "pin_id", "position"),
        # アップロード者ごとの容量集計（現在の使用量 = attached 分の SUM(byte_size)）に使う。
        Index("ix_pin_photos_uploaded_by_user_id", "uploaded_by_user_id"),
    )


class PinTag(Base):
    """ピンに付けたタグ1件（ピン単位の行。グローバルなタグマスタは持たない, B-D10）。"""

    __tablename__ = "pin_tags"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pin_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pins.id", ondelete="CASCADE")
    )
    label: Mapped[str] = mapped_column(String(20))
    # 正規化済み（trim・連続空白の圧縮・先頭記号除去・小文字化）の重複判定キー。
    label_key: Mapped[str] = mapped_column(String(20))
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("pin_id", "label_key", name="uq_pin_tags_pin_id_label_key"),
        # `created_by_user_id` は `users.id` への `ON DELETE CASCADE` FK。他のFKカラム
        # （`sanpo_maps.owner_user_id` 等）と同様、左端に含むインデックスを持たせておく
        # （招待機能で他人のピンにタグを付けられるようになった後のユーザー削除時、
        # シーケンシャルスキャンでロック保持時間が悪化しないようにする）。
        Index("ix_pin_tags_created_by_user_id", "created_by_user_id"),
    )


class PinPhotoUpload(Base):
    """写真アップロード枠。presigned POST の発行から確定（`pins`/写真追加 API での紐付け）
    までの状態を持つ。id 自体が API の `upload_id`。
    """

    __tablename__ = "pin_photo_uploads"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    s3_key: Mapped[str] = mapped_column(String(512))
    content_type: Mapped[str] = mapped_column(String(64))
    declared_byte_size: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending")
    # 枠を確定（紐付け）に使える期限。S3 の staging/ ライフサイクル（最短約24時間）より
    # 十分短くする（`PIN_PHOTO_UPLOAD_ATTACH_TTL_SECONDS`）。
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attached_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            f"status IN {PIN_PHOTO_UPLOAD_STATUSES}", name="ck_pin_photo_uploads_status"
        ),
        Index("ix_pin_photo_uploads_user_id_status_expires_at", "user_id", "status", "expires_at"),
    )
