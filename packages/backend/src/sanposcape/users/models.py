import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from sanposcape.database import Base


class User(Base):
    """認証済みユーザー（Google 等の IdP または dev モードで JIT 作成される）。

    SS-10 では認証に必要な最小限のカラムのみを持つ。プロフィール取得/更新/削除等の
    ユースケースは SS-12 で追加する。
    """

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("provider", "provider_subject", name="uq_users_provider_subject"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # "google" | "dev"（将来 "apple" 等を追加）
    provider: Mapped[str] = mapped_column(String(32))
    # Google の sub、または dev モードの user_key
    provider_subject: Mapped[str] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(320), default=None)
    display_name: Mapped[str | None] = mapped_column(String(255), default=None)
    photo_url: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
