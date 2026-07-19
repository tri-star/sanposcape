from datetime import datetime

from sqlalchemy import DateTime, Float, String, func
from sqlalchemy.orm import Mapped, mapped_column

from sanposcape.database import Base


class Spot(Base):
    """散歩の目的地候補・記録対象となる地点。

    現時点は Orval / OpenAPI 連携と DB マイグレーション動作確認用の
    最小サンプル。往復範囲探索(M4)で拡張する。
    """

    __tablename__ = "spots"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    category: Mapped[str | None] = mapped_column(String(64), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
