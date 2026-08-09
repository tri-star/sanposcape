"""walks の集計（GET /walks/stats）で使う日付ロジックと定数。

集計境界は JST 固定（ADR-003 SS-42 追補 決定10）。このモジュールは DB にも
Pydantic にも依存しない純粋関数だけを持ち、日時は必ず引数で受け取る
（`datetime.now()` / `date.today()` をここに書かない）。
"""

from collections.abc import Sequence
from datetime import UTC, date, datetime, time, timedelta
from typing import NamedTuple
from zoneinfo import ZoneInfo

WALK_STATS_TIMEZONE = "Asia/Tokyo"
JST = ZoneInfo(WALK_STATS_TIMEZONE)

WEEK_BUCKET_COUNT = 7  # 直近7日 = 1日 × 7
WEEK_BUCKET_DAYS = 1
MONTH_BUCKET_COUNT = 4  # 直近28日 = 7日 × 4
MONTH_BUCKET_DAYS = 7
STATS_WINDOW_DAYS = MONTH_BUCKET_COUNT * MONTH_BUCKET_DAYS  # 28。集計クエリの窓

WALK_STATS_STREAK_CHUNK_SIZE = 200  # streak 走査 1 回あたりの行数
WALK_STATS_STREAK_MAX_DAYS = 3660  # 安全弁（4.4 節参照。10年で打ち切る）


class DailyWalkTotals(NamedTuple):
    """repository の日次集計クエリ 1 行分（JST 暦日）。"""

    day: date
    walk_count: int
    duration_seconds: int
    distance_meters: int


def to_jst_date(moment: datetime) -> date:
    """aware datetime を JST の暦日に落とす。naive は受け付けない。"""
    if moment.tzinfo is None:
        raise ValueError("to_jst_date() requires an aware datetime")
    return moment.astimezone(JST).date()


def jst_day_start_utc(day: date) -> datetime:
    """JST 暦日の 00:00 を UTC の aware datetime にする。

    Asia/Tokyo は 1951 年以降 DST を持たない固定 +09:00 なので fold の曖昧さは無い。
    """
    return datetime.combine(day, time.min, tzinfo=JST).astimezone(UTC)


def build_bucket_ranges(
    *, today: date, bucket_count: int, bucket_days: int
) -> list[tuple[date, date]]:
    """今日を末尾（右端）とするローリングなバケット境界を古い順に返す（両端含む）。

    例: today=2026-08-09, count=4, days=7
        -> [(07-13, 07-19), (07-20, 07-26), (07-27, 08-02), (08-03, 08-09)]
    """
    ranges: list[tuple[date, date]] = []
    for index in range(bucket_count):
        # index=0 が最も古いバケット、index=bucket_count-1 が today を含む末尾バケット。
        offset_from_end = bucket_count - 1 - index
        end = today - timedelta(days=offset_from_end * bucket_days)
        start = end - timedelta(days=bucket_days - 1)
        ranges.append((start, end))
    return ranges


def extend_streak(dates_desc: Sequence[date], *, expected: date) -> tuple[int, date, bool]:
    """連続日数の続きを 1 チャンク分数える。

    `dates_desc` は JST 暦日の降順（同日重複を含んでよい）。
    戻り値 `(counted, next_expected, stopped)`。
    `stopped=True` はギャップを検出したので以降のチャンクが不要であることを表す。
    """
    counted = 0
    for d in dates_desc:
        if d > expected:
            continue  # 既に数えた日の重複
        if d == expected:
            counted += 1
            expected -= timedelta(days=1)
            continue
        return counted, expected, True  # d < expected -> ギャップ
    return counted, expected, False
