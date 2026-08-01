import uuid
from datetime import datetime

from sqlalchemy import select, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, defer

from sanposcape.walks.models import Walk


class WalkRepository:
    """walks テーブルへの DB アクセスを隔離する層。

    すべてのメソッドが `user_id` を必須引数に取る。ID だけで引ける口を作らないことが
    IDOR 対策の構造的な担保（D6）。
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    def get_by_id(self, *, user_id: uuid.UUID, walk_id: uuid.UUID) -> Walk | None:
        stmt = select(Walk).where(Walk.id == walk_id, Walk.user_id == user_id)
        return self._db.scalars(stmt).first()

    def get_by_client_walk_id(
        self, *, user_id: uuid.UUID, client_walk_id: uuid.UUID
    ) -> Walk | None:
        stmt = select(Walk).where(Walk.user_id == user_id, Walk.client_walk_id == client_walk_id)
        return self._db.scalars(stmt).first()

    def list_for_user(
        self,
        *,
        user_id: uuid.UUID,
        limit: int,
        cursor: tuple[datetime, uuid.UUID] | None = None,
        started_after: datetime | None = None,
        started_before: datetime | None = None,
    ) -> list[Walk]:
        """`started_at DESC, id DESC` で並べた散歩を最大 `limit + 1` 件返す。

        呼び出し元（service）は `limit + 1` 件目の有無で `next_cursor` の要否を判断する。
        一覧表示に不要な `track_points`（JSONB, TOASTに退避され得る）は defer し、
        一覧全件に展開コストが乗らないようにする。
        """
        stmt = (
            select(Walk)
            .where(Walk.user_id == user_id)
            .options(defer(Walk.track_points))
            .order_by(Walk.started_at.desc(), Walk.id.desc())
            .limit(limit + 1)
        )
        if started_after is not None:
            stmt = stmt.where(Walk.started_at >= started_after)
        if started_before is not None:
            stmt = stmt.where(Walk.started_at < started_before)
        if cursor is not None:
            cursor_started_at, cursor_id = cursor
            # keyset 条件（行値比較）: (started_at, id) < (cursor_started_at, cursor_id)
            stmt = stmt.where(tuple_(Walk.started_at, Walk.id) < (cursor_started_at, cursor_id))

        return list(self._db.scalars(stmt).all())

    def create(
        self,
        *,
        user_id: uuid.UUID,
        client_walk_id: uuid.UUID,
        started_at: datetime,
        ended_at: datetime,
        duration_seconds: int,
        distance_meters: int,
        destination_place_id: str,
        destination_name: str,
        destination_latitude: float,
        destination_longitude: float,
        track_points: list[list[float]],
    ) -> tuple[Walk, bool]:
        """散歩を新規作成する。戻り値は `(walk, created)`。

        `(user_id, client_walk_id)` の UNIQUE 制約により、同じ散歩の再送は
        `IntegrityError` になる。`users/repository.py:create()` と同じ savepoint
        パターン（`db.begin_nested()`）で捕捉し、既存行を再取得して返す
        （`created=False`）。savepoint を使う理由も同様: 素の `db.rollback()` は
        呼び出し元が張っている外側のトランザクション全体を巻き戻してしまうため。
        """
        walk = Walk(
            user_id=user_id,
            client_walk_id=client_walk_id,
            started_at=started_at,
            ended_at=ended_at,
            duration_seconds=duration_seconds,
            distance_meters=distance_meters,
            destination_place_id=destination_place_id,
            destination_name=destination_name,
            destination_latitude=destination_latitude,
            destination_longitude=destination_longitude,
            track_points=track_points,
        )
        try:
            with self._db.begin_nested():
                self._db.add(walk)
                self._db.flush()
        except IntegrityError:
            existing = self.get_by_client_walk_id(user_id=user_id, client_walk_id=client_walk_id)
            if existing is None:
                # 一意制約違反なのに再取得できない状況は理論上あり得ないはずだが、
                # 万一に備えて元の例外を再送出する（サイレントな不整合より500の方が安全）。
                raise
            return existing, False
        self._db.refresh(walk)
        return walk, True
