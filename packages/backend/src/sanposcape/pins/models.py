import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from sanposcape.database import Base

#: `PinPhotoUpload.status` に許容する値。
PIN_PHOTO_UPLOAD_STATUSES = ("pending", "attached")


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

    __table_args__ = (UniqueConstraint("pin_id", "label_key", name="uq_pin_tags_pin_id_label_key"),)


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
