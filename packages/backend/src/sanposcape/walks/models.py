import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from sanposcape.database import Base


class Walk(Base):
    """1回の完了した散歩の記録。行 = 終了済みの散歩（進行中は表現しない、D1）。

    `track_points` は `[[lat, lng], ...]` の座標ペア配列（JSONB、小数6桁に丸め済み）で
    保存する（D2）。API では `walks/mappers.py` を介して `list[GeoPoint]` に変換する。

    `User` 側には意図して `relationship()` を追加しない。既存のアカウント削除
    （`users/repository.py:delete()`）は `ON DELETE CASCADE` に依存して1トランザクションで
    完結しており、`passive_deletes` 未指定の relationship を足すと SQLAlchemy が
    子行の FK を UPDATE で NULL にしようとして CASCADE 前提の削除が壊れる。
    """

    __tablename__ = "walks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    # 冪等キー（mobile が散歩開始時に採番する UUID）。同一 (user_id, client_walk_id) の
    # 再送は同じ行を返す（D3）。
    client_walk_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # 一時停止を除いた実活動秒。`ended_at - started_at` とは別カラムで持つ（D4）。
    duration_seconds: Mapped[int] = mapped_column(Integer)
    distance_meters: Mapped[int] = mapped_column(Integer)
    destination_place_id: Mapped[str] = mapped_column(String(256))
    # ユーザー自身の記録のスナップショットとして保存する表示用の名称。
    # 識別子・認可入力には使わない（Q3）。
    destination_name: Mapped[str] = mapped_column(String(256))
    destination_latitude: Mapped[float] = mapped_column(Float)
    destination_longitude: Mapped[float] = mapped_column(Float)
    # [[lat, lng], ...] の座標ペア配列（D2）。一覧クエリでは SELECT しない（defer）こと。
    track_points: Mapped[list] = mapped_column(JSONB, server_default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "client_walk_id", name="uq_walks_user_client_walk_id"),
        # 履歴一覧の主クエリ（user スコープ + started_at DESC, id DESC の並び替え + keyset
        # 比較 + 期間フィルタ）を1本で賄う複合インデックス。
        Index(
            "ix_walks_user_id_started_at_id",
            "user_id",
            started_at.desc(),
            id.desc(),
        ),
    )
