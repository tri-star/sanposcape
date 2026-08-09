from datetime import UTC, date, datetime, timedelta

from sanposcape.walks.stats import (
    build_bucket_ranges,
    extend_streak,
    jst_day_start_utc,
    to_jst_date,
)


class TestToJstDate:
    def test_p1_just_before_jst_day_boundary(self) -> None:
        # 2026-03-15T14:59:59Z == 2026-03-15T23:59:59+09:00
        moment = datetime(2026, 3, 15, 14, 59, 59, tzinfo=UTC)

        assert to_jst_date(moment) == date(2026, 3, 15)

    def test_p2_exactly_at_jst_day_boundary(self) -> None:
        # 2026-03-15T15:00:00Z == 2026-03-16T00:00:00+09:00
        moment = datetime(2026, 3, 15, 15, 0, 0, tzinfo=UTC)

        assert to_jst_date(moment) == date(2026, 3, 16)


class TestJstDayStartUtc:
    def test_p3_returns_utc_aware_start_of_day(self) -> None:
        result = jst_day_start_utc(date(2026, 3, 15))

        assert result == datetime(2026, 3, 14, 15, 0, 0, tzinfo=UTC)


class TestBuildBucketRanges:
    def test_p4_week_buckets_are_single_day_each(self) -> None:
        today = date(2026, 3, 15)

        ranges = build_bucket_ranges(today=today, bucket_count=7, bucket_days=1)

        assert len(ranges) == 7
        assert all(start == end for start, end in ranges)
        assert ranges[-1] == (today, today)
        oldest = today - timedelta(days=6)
        assert ranges[0] == (oldest, oldest)

    def test_p5_month_buckets_are_seven_days_each(self) -> None:
        today = date(2026, 3, 15)

        ranges = build_bucket_ranges(today=today, bucket_count=4, bucket_days=7)

        assert len(ranges) == 4
        for start, end in ranges:
            assert (end - start).days == 6
        last_start, last_end = ranges[-1]
        assert last_start <= today <= last_end
        first_start, _ = ranges[0]
        assert first_start == today - timedelta(days=27)


class TestExtendStreak:
    def test_p6_empty_dates(self) -> None:
        today = date(2026, 3, 15)

        counted, next_expected, stopped = extend_streak([], expected=today)

        assert (counted, next_expected, stopped) == (0, today, False)

    def test_p7_two_consecutive_days(self) -> None:
        today = date(2026, 3, 15)
        yesterday = date(2026, 3, 14)

        counted, next_expected, stopped = extend_streak([today, yesterday], expected=today)

        assert (counted, next_expected, stopped) == (2, date(2026, 3, 13), False)

    def test_p8_duplicate_same_day_counts_once(self) -> None:
        today = date(2026, 3, 15)
        yesterday = date(2026, 3, 14)

        counted, next_expected, stopped = extend_streak([today, today, yesterday], expected=today)

        assert (counted, next_expected, stopped) == (2, date(2026, 3, 13), False)

    def test_p9_gap_stops_early(self) -> None:
        today = date(2026, 3, 15)
        two_days_ago = date(2026, 3, 13)

        counted, next_expected, stopped = extend_streak([today, two_days_ago], expected=today)

        assert (counted, next_expected, stopped) == (1, date(2026, 3, 14), True)

    def test_p10_no_yesterday_either(self) -> None:
        yesterday = date(2026, 3, 14)
        three_days_ago = date(2026, 3, 11)

        counted, next_expected, stopped = extend_streak([three_days_ago], expected=yesterday)

        assert (counted, next_expected, stopped) == (0, yesterday, True)
