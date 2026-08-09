from datetime import UTC, date, datetime, timedelta

from sanposcape.walks.stats import (
    build_bucket_ranges,
    extend_streak,
    jst_day_start_utc,
    should_continue_streak_scan,
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

    def test_p2b_leap_day_just_before_jst_boundary(self) -> None:
        # 2028-02-28T14:59:59Z == 2028-02-28T23:59:59+09:00（2028年はうるう年）
        moment = datetime(2028, 2, 28, 14, 59, 59, tzinfo=UTC)

        assert to_jst_date(moment) == date(2028, 2, 28)

    def test_p2c_leap_day_exactly_at_jst_boundary(self) -> None:
        # 2028-02-28T15:00:00Z == 2028-02-29T00:00:00+09:00（うるう日に入る）
        moment = datetime(2028, 2, 28, 15, 0, 0, tzinfo=UTC)

        assert to_jst_date(moment) == date(2028, 2, 29)

    def test_p2d_last_moment_of_leap_day_in_jst(self) -> None:
        # 2028-02-29T14:59:59Z == 2028-02-29T23:59:59+09:00（うるう日最後の瞬間）
        moment = datetime(2028, 2, 29, 14, 59, 59, tzinfo=UTC)

        assert to_jst_date(moment) == date(2028, 2, 29)

    def test_p2e_leap_day_ends_and_march_begins_in_jst(self) -> None:
        # 2028-02-29T15:00:00Z == 2028-03-01T00:00:00+09:00（うるう日から3/1へ）
        moment = datetime(2028, 2, 29, 15, 0, 0, tzinfo=UTC)

        assert to_jst_date(moment) == date(2028, 3, 1)


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

    def test_p5b_month_buckets_cross_leap_day(self) -> None:
        # 2028年はうるう年。today=03-05 なら窓は 02-07〜03-05 で 2/29 を跨ぐ。
        today = date(2028, 3, 5)

        ranges = build_bucket_ranges(today=today, bucket_count=4, bucket_days=7)

        assert len(ranges) == 4
        for start, end in ranges:
            assert (end - start).days == 6
        first_start, _ = ranges[0]
        assert first_start == today - timedelta(days=27) == date(2028, 2, 7)
        last_start, last_end = ranges[-1]
        assert last_start <= today <= last_end
        # 2/29 を含むバケットが存在する（うるう日がバケットから欠落しない）ことを確認する。
        assert any(start <= date(2028, 2, 29) <= end for start, end in ranges)

    def test_p5c_week_buckets_cross_leap_day(self) -> None:
        # today=2028-03-01 の直近7日は 2/24〜3/1 で 2/29 を含む。
        today = date(2028, 3, 1)

        ranges = build_bucket_ranges(today=today, bucket_count=7, bucket_days=1)

        assert len(ranges) == 7
        assert (date(2028, 2, 29), date(2028, 2, 29)) in ranges


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


class TestShouldContinueStreakScan:
    def test_p11_stops_when_gap_detected(self) -> None:
        # ギャップ検出済み（stopped=True）なら他の値に関わらず走査を止める。
        assert (
            should_continue_streak_scan(
                stopped=True, chunk_len=200, chunk_size=200, total=1, max_days=3660
            )
            is False
        )

    def test_p12_stops_when_chunk_is_shorter_than_chunk_size(self) -> None:
        # 読めた行数がチャンクサイズ未満 = DB にこれ以上データが無い。
        assert (
            should_continue_streak_scan(
                stopped=False, chunk_len=5, chunk_size=200, total=5, max_days=3660
            )
            is False
        )

    def test_p13_stops_when_total_reaches_max_days(self) -> None:
        # 安全弁: 累計がちょうど上限に達したら止める。
        assert (
            should_continue_streak_scan(
                stopped=False, chunk_len=200, chunk_size=200, total=3660, max_days=3660
            )
            is False
        )

    def test_p14_stops_when_total_exceeds_max_days(self) -> None:
        # 安全弁: チャンク処理後の累計が上限を超えていても止める（オーバーシュート容認）。
        assert (
            should_continue_streak_scan(
                stopped=False, chunk_len=200, chunk_size=200, total=3800, max_days=3660
            )
            is False
        )

    def test_p15_continues_when_full_chunk_and_below_max_days(self) -> None:
        # フルチャンクを読めていて、まだ安全弁に達していなければ次のチャンクへ進む。
        assert (
            should_continue_streak_scan(
                stopped=False, chunk_len=200, chunk_size=200, total=400, max_days=3660
            )
            is True
        )
