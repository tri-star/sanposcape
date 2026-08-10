"""service層の戻り値（Walk モデル）をレスポンススキーマへ変換するマッパー。

`Walk` は目的地をフラットな列で持つため `from_attributes` では表現できず、
`auth/mappers.py` と同じ形で明示的な変換関数を用意する。
"""

from collections.abc import Mapping
from datetime import date, datetime, timedelta

from sanposcape.core.geo import GeoPoint
from sanposcape.walks.models import Walk
from sanposcape.walks.schemas import (
    WalkDestinationRead,
    WalkDetailRead,
    WalkRead,
    WalkStatsBucketRead,
    WalkStatsPeriodRead,
    WalkStatsRead,
    WalkStatsTodayRead,
)
from sanposcape.walks.stats import (
    MONTH_BUCKET_COUNT,
    MONTH_BUCKET_DAYS,
    WALK_STATS_TIMEZONE,
    WEEK_BUCKET_COUNT,
    WEEK_BUCKET_DAYS,
    DailyWalkTotals,
    build_bucket_ranges,
)

# 座標の丸め桁数。約0.11m相当で GPS 精度より十分細かく、JSONB の行サイズを抑える。
TRACK_COORDINATE_DIGITS = 6

_ONE_DAY = timedelta(days=1)


def track_to_storage(points: list[GeoPoint]) -> list[list[float]]:
    """API から受け取った軌跡を JSONB 保存用の `[[lat, lng], ...]` に変換する。"""
    return [
        [
            round(point.latitude, TRACK_COORDINATE_DIGITS),
            round(point.longitude, TRACK_COORDINATE_DIGITS),
        ]
        for point in points
    ]


def track_from_storage(raw: list) -> list[GeoPoint]:
    """JSONB に保存された軌跡を API レスポンス用の `list[GeoPoint]` に変換する。

    DB 側の壊れたデータ（要素数が2でない・数値でない）は握りつぶさず例外にする。
    """
    points: list[GeoPoint] = []
    for row in raw:
        if not isinstance(row, list | tuple) or len(row) != 2:
            raise ValueError(f"invalid track point row (expected [lat, lng]): {row!r}")
        latitude, longitude = row
        if not isinstance(latitude, int | float) or not isinstance(longitude, int | float):
            raise ValueError(f"invalid track point row (non-numeric value): {row!r}")
        points.append(GeoPoint(latitude=latitude, longitude=longitude))
    return points


def to_walk_read(walk: Walk) -> WalkRead:
    return WalkRead(
        id=walk.id,
        client_walk_id=walk.client_walk_id,
        started_at=walk.started_at,
        ended_at=walk.ended_at,
        duration_seconds=walk.duration_seconds,
        distance_meters=walk.distance_meters,
        destination=WalkDestinationRead(
            place_id=walk.destination_place_id,
            name=walk.destination_name,
            location=GeoPoint(
                latitude=walk.destination_latitude,
                longitude=walk.destination_longitude,
            ),
        ),
        created_at=walk.created_at,
    )


def to_walk_detail_read(walk: Walk) -> WalkDetailRead:
    base = to_walk_read(walk)
    return WalkDetailRead(**base.model_dump(), track=track_from_storage(walk.track_points))


def _totals_for_day(
    totals_by_day: Mapping[date, DailyWalkTotals], day: date
) -> tuple[int, int, int]:
    row = totals_by_day.get(day)
    if row is None:
        return 0, 0, 0
    return row.walk_count, row.duration_seconds, row.distance_meters


def _build_period(
    *,
    totals_by_day: Mapping[date, DailyWalkTotals],
    today: date,
    bucket_count: int,
    bucket_days: int,
) -> WalkStatsPeriodRead:
    """日次集計をゼロ埋めしつつバケットへ畳む（week / month で共有するヘルパー）。"""
    ranges = build_bucket_ranges(today=today, bucket_count=bucket_count, bucket_days=bucket_days)

    buckets: list[WalkStatsBucketRead] = []
    total_walk_count = 0
    total_duration_seconds = 0
    total_distance_meters = 0
    for start, end in ranges:
        bucket_walk_count = 0
        bucket_duration_seconds = 0
        bucket_distance_meters = 0
        day = start
        while day <= end:
            walk_count, duration_seconds, distance_meters = _totals_for_day(totals_by_day, day)
            bucket_walk_count += walk_count
            bucket_duration_seconds += duration_seconds
            bucket_distance_meters += distance_meters
            day += _ONE_DAY

        buckets.append(
            WalkStatsBucketRead(
                start_date=start,
                end_date=end,
                walk_count=bucket_walk_count,
                duration_seconds=bucket_duration_seconds,
                distance_meters=bucket_distance_meters,
                is_current=start <= today <= end,
            )
        )
        total_walk_count += bucket_walk_count
        total_duration_seconds += bucket_duration_seconds
        total_distance_meters += bucket_distance_meters

    return WalkStatsPeriodRead(
        start_date=ranges[0][0],
        end_date=ranges[-1][1],
        total_walk_count=total_walk_count,
        total_duration_seconds=total_duration_seconds,
        total_distance_meters=total_distance_meters,
        buckets=buckets,
    )


def to_walk_stats_read(
    *,
    totals_by_day: Mapping[date, DailyWalkTotals],
    today: date,
    streak_days: int,
    generated_at: datetime,
) -> WalkStatsRead:
    """日次集計をゼロ埋めしつつ week / month のバケットへ畳んでレスポンスにする。"""
    today_walk_count, today_duration_seconds, today_distance_meters = _totals_for_day(
        totals_by_day, today
    )
    return WalkStatsRead(
        timezone=WALK_STATS_TIMEZONE,
        generated_at=generated_at,
        today=WalkStatsTodayRead(
            date=today,
            walk_count=today_walk_count,
            duration_seconds=today_duration_seconds,
            distance_meters=today_distance_meters,
        ),
        streak_days=streak_days,
        week=_build_period(
            totals_by_day=totals_by_day,
            today=today,
            bucket_count=WEEK_BUCKET_COUNT,
            bucket_days=WEEK_BUCKET_DAYS,
        ),
        month=_build_period(
            totals_by_day=totals_by_day,
            today=today,
            bucket_count=MONTH_BUCKET_COUNT,
            bucket_days=MONTH_BUCKET_DAYS,
        ),
    )
