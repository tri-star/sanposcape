import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from sanposcape.database import Base


class User(Base):
    """認証済みユーザー（Google 等の IdP または dev モードで JIT 作成される）。

    認証に必要な最小限のカラムを持つ。SS-12 では、認証済み本人による物理削除を
    サポートし、紐づく refresh token は DB の cascade で同一トランザクション内に削除する。
    """

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("provider", "provider_subject", name="uq_users_provider_subject"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # "google" | "apple" | "dev"
    provider: Mapped[str] = mapped_column(String(32))
    # Google / Apple の sub（Apple は約 44 文字）、または dev モードの user_key
    provider_subject: Mapped[str] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(320), default=None)
    display_name: Mapped[str | None] = mapped_column(String(255), default=None)
    photo_url: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AppleAuthorization(Base):
    """Apple ユーザーの Sign in with Apple の認可（アカウント削除時の失効用。SS-198）。

    サインイン時に端末から受け取った authorization code を Apple の `/auth/token` で交換して得た
    refresh token を、削除時に `/auth/revoke` で失効させるために保存する。

    - 1 ユーザー 1 行（`user_id` が主キー）。再サインインのたびに最新の token で上書きする。
    - `users.id` への `ON DELETE CASCADE`。ユーザーの削除と一緒に消える。
      `User` 側に relationship を定義しないのは、ORM の `session.delete(user)` がこのテーブルを
      読みに行くと、マイグレーション前の空白で Google ユーザーの削除まで失敗するため。
    - `client_id` は交換に使った App ID（bundle ID）。失効には元の認可要求と同じ値が要る。
    - `refresh_token` は暗号化せず平文で保存する。この token は Apple の API にしか使えず、
      使うには .p8 で署名した client secret が要る。暗号鍵を置く先も .p8 と同じ
      Secrets Manager になるため、暗号化しても防御がほとんど増えない（ADR-002 の SS-198 追補）。
    """

    __tablename__ = "apple_authorizations"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    client_id: Mapped[str] = mapped_column(String(255))
    refresh_token: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
