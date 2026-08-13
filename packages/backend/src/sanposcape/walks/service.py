import logging
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
    should_continue_streak_scan,
    to_jst_date,
)

logger = logging.getLogger(__name__)


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

    def delete_walk(self, current_user: User, walk_id: uuid.UUID) -> None:
        """自分の散歩を1件削除する。他ユーザーの散歩・存在しない ID はいずれも 404（D6）。

        削除に成功した場合（`repository.delete()` が True）のみ commit する。False の
        場合は2通りある: (1) 対象が見つからず repository 側で flush していないケース、
        (2) 対象は見つかったが同時実行競合（真に同時な2重DELETE、詳細は
        `WalkRepository.delete()` docstring 参照）により flush 自体は行われたものの
        0行しか消せず失敗として扱われるケース。どちらの場合も明示的な rollback は
        呼ばない: このメソッドは commit せずに WalkNotFoundError を送出するだけで、
        未コミットの変更（あれば）はセッションが get_db の finally で `close()` される
        際に暗黙にロールバックされるため。
        """
        if not self._repository.delete(user_id=current_user.id, walk_id=walk_id):
            raise WalkNotFoundError()
        self._db.commit()
        logger.info("Walk deleted (user_id=%s, walk_id=%s)", current_user.id, walk_id)

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
            # break 条件（ギャップ検出 / データ枯渇 / 安全弁）は stats.py に集約している。
            if not should_continue_streak_scan(
                stopped=stopped,
                chunk_len=len(chunk),
                chunk_size=WALK_STATS_STREAK_CHUNK_SIZE,
                total=total,
                max_days=WALK_STATS_STREAK_MAX_DAYS,
            ):
                break
            # 直近に見た日の 00:00 JST より前へ進む。before は必ず単調減少するので無限ループしない
            before = jst_day_start_utc(chunk[-1])
            chunk = self._repository.list_walk_dates_desc(
                user_id=user_id,
                timezone_name=WALK_STATS_TIMEZONE,
                before=before,
                limit=WALK_STATS_STREAK_CHUNK_SIZE,
            )
        return total
