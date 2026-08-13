import uuid
import warnings
from datetime import date, datetime

from sqlalchemy import Date, cast, func, select, tuple_
from sqlalchemy import exc as sa_exc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, defer
from sqlalchemy.orm.exc import StaleDataError

from sanposcape.walks.models import Walk
from sanposcape.walks.stats import DailyWalkTotals


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

    def delete(self, *, user_id: uuid.UUID, walk_id: uuid.UUID) -> bool:
        """自分の散歩を1件削除する。削除できたら True、対象が無ければ False。

        他ユーザーの散歩・存在しない ID をここで区別しない（呼び出し元が 404 に変換する、D6）。
        `user_id` を必須キーワード引数に取る規約（D6）はこのメソッドにも適用する。
        commit はユースケース境界の service が持つ（users/repository.py:delete() と同じ分担）。
        track_points（JSONB）は削除に不要なので defer する。
        ORM の `session.delete()` を使い、`sqlalchemy.delete()` の一括 DELETE 文は使わない
        （一括 DELETE は `synchronize_session` の挙動に依存し、同一セッションの identity map
        に載っている行が失効せず、削除したはずの行を後続処理が掴み続ける事故が起きうるため）。

        select → delete → flush の2段階処理のため、同一 `walk_id` への真に同時な2重DELETE
        （通信不安定時のリトライ・連打）では、後発側が select 時点では行を見つけて delete まで
        進むものの、flush 時点では先発側が既に commit 済みで対象行が消えている、という競合が
        起きうる（DB の行ロックにより、後発側の DELETE は先発側の commit までブロックされ、
        commit 後に 0 行ヒットで再開する）。

        `Walk` に `version_id_col`（楽観的排他制御用のバージョン列）は無いため、SQLAlchemy の
        `confirm_deleted_rows`（既定 True）はこのケースを `sqlalchemy.orm.exc.StaleDataError`
        ではなく `sqlalchemy.exc.SAWarning` の warning としてのみ報告する（バージョン列がある
        場合は例外になるが、無い場合は「削除できたか確認できない」という扱いで警告に留まる、
        という SQLAlchemy 自身の仕様）。警告のままだと後発側の `flush()` は例外を投げずに
        成功したように見え、`delete()` が実際には0行しか消していないのに `True` を返してしまう
        （ADR-003 決定13「2回目の DELETE は404」に反する誤った成功応答になる）。
        そのため、この `flush()` 呼び出しの間だけ `SAWarning` を例外に昇格させ、
        `StaleDataError`（将来 `version_id_col` を足した場合に備える）と合わせて捕捉し、
        `False` を返す。これにより後発側も「対象が無い」（= 呼び出し元が404に変換する、D6）
        という通常の未検出パスに揃う。
        """
        stmt = (
            select(Walk)
            .where(Walk.id == walk_id, Walk.user_id == user_id)
            .options(defer(Walk.track_points))
        )
        walk = self._db.scalars(stmt).first()
        if walk is None:
            return False
        try:
            self._db.delete(walk)
            with warnings.catch_warnings():
                warnings.simplefilter("error", sa_exc.SAWarning)
                self._db.flush()
        except (StaleDataError, sa_exc.SAWarning):
            return False
        return True

    def aggregate_daily_for_user(
        self,
        *,
        user_id: uuid.UUID,
        timezone_name: str,
        started_at_from: datetime,
        started_at_until: datetime,
    ) -> list[DailyWalkTotals]:
        """JST 暦日ごとの件数・実活動秒・距離を集計して古い順に返す。

        - 期間の絞り込み（`started_at_from` 以上・`started_at_until` 未満、いずれも UTC
          aware）は素の timestamptz 比較で行う。式にすると
          `ix_walks_user_id_started_at_id` が効かなくなるため。
        - 帰属日は `started_at` の JST 暦日（`ended_at` ではない: 日跨ぎは開始日に計上）。
        - 散歩が 0 件の日は行が返らない（ゼロ埋めは呼び出し側の責務）。
        - ORM エンティティ（`select(Walk)`）ではなく列指定の集計クエリのため、
          `track_points`（JSONB）は SELECT に一切現れない。
        """
        day = cast(func.timezone(timezone_name, Walk.started_at), Date).label("day")
        stmt = (
            select(
                day,
                func.count().label("walk_count"),
                func.sum(Walk.duration_seconds).label("duration_seconds"),
                func.sum(Walk.distance_meters).label("distance_meters"),
            )
            .where(
                Walk.user_id == user_id,
                Walk.started_at >= started_at_from,
                Walk.started_at < started_at_until,
            )
            .group_by(day)
            .order_by(day)
        )
        return [DailyWalkTotals(*row) for row in self._db.execute(stmt).all()]

    def list_walk_dates_desc(
        self,
        *,
        user_id: uuid.UUID,
        timezone_name: str,
        before: datetime,
        limit: int,
    ) -> list[date]:
        """散歩の JST 暦日を新しい順に最大 `limit` 件返す（同日重複を含む）。

        streak 算出の走査用。並び順を式ではなく `started_at`（`before` は UTC aware
        の排他的上限）にすることで `ix_walks_user_id_started_at_id` の順序をそのまま
        使い、`LIMIT` でインデックススキャンを早期に打ち切る（全件読みを避ける）。
        JST 暦日 DESC と `started_at` DESC は単調に一致するため順序は等価。
        `id.desc()` は `list_for_user` と同じ副ソートキーで、インデックス
        `(user_id, started_at DESC, id DESC)` の順序に厳密に一致させるためのもの
        （`started_at` の同値時にページング結果が安定する）。
        """
        day = cast(func.timezone(timezone_name, Walk.started_at), Date)
        stmt = (
            select(day)
            .where(Walk.user_id == user_id, Walk.started_at < before)
            .order_by(Walk.started_at.desc(), Walk.id.desc())
            .limit(limit)
        )
        return list(self._db.scalars(stmt).all())
