import uuid
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.orm import Session

from sanposcape.core.pagination import decode_cursor, encode_cursor
from sanposcape.users.models import User
from sanposcape.walks.exceptions import WalkNotFoundError
from sanposcape.walks.mappers import (
    to_walk_detail_read,
    to_walk_read,
    to_walk_stats_read,
    track_to_storage,
)
from sanposcape.walks.repository import WalkRepository
from sanposcape.walks.schemas import (
    WalkCreate,
    WalkDetailRead,
    WalkListRead,
    WalkRead,
    WalkStatsRead,
)
from sanposcape.walks.stats import (
    STATS_WINDOW_DAYS,
    WALK_STATS_STREAK_CHUNK_SIZE,
    WALK_STATS_STREAK_MAX_DAYS,
    WALK_STATS_TIMEZONE,
    extend_streak,
    jst_day_start_utc,
    to_jst_date,
)


class WalkService:
    """散歩(Walk)に関するユースケース。トランザクション境界（commit）はここが持つ。"""

    def __init__(
        self,
        db: Session,
        repository: WalkRepository,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._db = db
        self._repository = repository
        # 「今日」の判定に使う。テストから固定できるよう注入可能にする
        # （auth/service.py の AuthService と同じ形）。
        self._now = now

    def record_walk(self, current_user: User, payload: WalkCreate) -> tuple[WalkRead, bool]:
        """散歩の記録を保存する。戻り値は `(walk, created)`。

        `created=False` は `client_walk_id` の再送（冪等な既存行の返却）を表す。
        """
        walk, created = self._repository.create(
            user_id=current_user.id,
            client_walk_id=payload.client_walk_id,
            started_at=payload.started_at,
            ended_at=payload.ended_at,
            duration_seconds=payload.duration_seconds,
            distance_meters=payload.distance_meters,
            destination_place_id=payload.destination.place_id,
            destination_name=payload.destination.name,
            destination_latitude=payload.destination.location.latitude,
            destination_longitude=payload.destination.location.longitude,
            track_points=track_to_storage(payload.track),
        )
        self._db.commit()
        return to_walk_read(walk), created

    def list_walks(
        self,
        current_user: User,
        *,
        limit: int,
        cursor: str | None,
        started_after: datetime | None,
        started_before: datetime | None,
    ) -> WalkListRead:
        decoded_cursor = decode_cursor(cursor) if cursor is not None else None

        rows = self._repository.list_for_user(
            user_id=current_user.id,
            limit=limit,
            cursor=decoded_cursor,
            started_after=started_after,
            started_before=started_before,
        )

        has_more = len(rows) > limit
        page = rows[:limit]
        next_cursor = encode_cursor(page[-1].started_at, page[-1].id) if has_more and page else None

        return WalkListRead(items=[to_walk_read(walk) for walk in page], next_cursor=next_cursor)

    def get_walk(self, current_user: User, walk_id: uuid.UUID) -> WalkDetailRead:
        walk = self._repository.get_by_id(user_id=current_user.id, walk_id=walk_id)
        if walk is None:
            raise WalkNotFoundError()
        return to_walk_detail_read(walk)

    def get_walk_stats(self, current_user: User) -> WalkStatsRead:
        """記録タブ向けの集計（今日 / 直近7日 / 直近28日 / 連続日数）を返す。

        期間境界・暦日の帰属はすべて JST 固定（ADR-003 SS-42 追補 決定10）。
        読み取り専用なので commit しない。
        """
        generated_at = self._now().astimezone(UTC)
        today = to_jst_date(generated_at)

        window_start = today - timedelta(days=STATS_WINDOW_DAYS - 1)
        rows = self._repository.aggregate_daily_for_user(
            user_id=current_user.id,
            timezone_name=WALK_STATS_TIMEZONE,
            started_at_from=jst_day_start_utc(window_start),
            started_at_until=jst_day_start_utc(today + timedelta(days=1)),  # 未来日を除外
        )
        totals_by_day = {row.day: row for row in rows}
        streak_days = self._count_streak_days(user_id=current_user.id, today=today)
        return to_walk_stats_read(
            totals_by_day=totals_by_day,
            today=today,
            streak_days=streak_days,
            generated_at=generated_at,
        )

    def _count_streak_days(self, *, user_id: uuid.UUID, today: date) -> int:
        """連続日数をインデックス順のチャンク走査 + 早期打ち切りで数える。"""
        before = jst_day_start_utc(today + timedelta(days=1))
        chunk = self._repository.list_walk_dates_desc(
            user_id=user_id,
            timezone_name=WALK_STATS_TIMEZONE,
            before=before,
            limit=WALK_STATS_STREAK_CHUNK_SIZE,
        )
        if not chunk:
            return 0
        # 今日に散歩が無ければ昨日を起点にする（今日未散歩で連続を切らない）
        expected = today if chunk[0] == today else today - timedelta(days=1)

        total = 0
        while True:
            counted, expected, stopped = extend_streak(chunk, expected=expected)
            total += counted
            if stopped or len(chunk) < WALK_STATS_STREAK_CHUNK_SIZE:
                break
            if total >= WALK_STATS_STREAK_MAX_DAYS:
                break  # 安全弁（4.4 節参照）
            # 直近に見た日の 00:00 JST より前へ進む。before は必ず単調減少するので無限ループしない
            before = jst_day_start_utc(chunk[-1])
            chunk = self._repository.list_walk_dates_desc(
                user_id=user_id,
                timezone_name=WALK_STATS_TIMEZONE,
                before=before,
                limit=WALK_STATS_STREAK_CHUNK_SIZE,
            )
            if not chunk:
                break
        return total
