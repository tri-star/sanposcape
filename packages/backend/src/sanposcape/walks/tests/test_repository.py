import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from sanposcape.walks.repository import WalkRepository
from sanposcape.walks.stats import WALK_STATS_TIMEZONE
from sanposcape.walks.tests.conftest import make_user as _make_user


def _create_walk(
    repo: WalkRepository,
    *,
    user_id: uuid.UUID,
    client_walk_id: uuid.UUID | None = None,
    started_at: datetime,
    track_points: list | None = None,
):
    walk, created = repo.create(
        user_id=user_id,
        client_walk_id=client_walk_id or uuid.uuid4(),
        started_at=started_at,
        ended_at=started_at + timedelta(minutes=10),
        duration_seconds=600,
        distance_meters=1000,
        destination_place_id="place-1",
        destination_name="テスト公園",
        destination_latitude=35.68,
        destination_longitude=139.76,
        track_points=track_points if track_points is not None else [],
    )
    return walk, created


class TestCreate:
    def test_creates_new_walk(self, db_session: Session) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)

        walk, created = _create_walk(
            repo, user_id=user.id, started_at=datetime(2026, 8, 1, 9, 0, 0, tzinfo=UTC)
        )

        assert created is True
        assert walk.user_id == user.id

    def test_same_client_walk_id_returns_existing_row_without_duplicate_insert(
        self, db_session: Session
    ) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)
        client_walk_id = uuid.uuid4()
        started_at = datetime(2026, 8, 1, 9, 0, 0, tzinfo=UTC)

        first, first_created = _create_walk(
            repo, user_id=user.id, client_walk_id=client_walk_id, started_at=started_at
        )
        second, second_created = _create_walk(
            repo, user_id=user.id, client_walk_id=client_walk_id, started_at=started_at
        )

        assert first_created is True
        assert second_created is False
        assert first.id == second.id
        count = db_session.query(type(first)).filter_by(user_id=user.id).count()
        assert count == 1

    def test_different_users_can_reuse_the_same_client_walk_id(self, db_session: Session) -> None:
        user_a = _make_user(db_session, subject="a")
        user_b = _make_user(db_session, subject="b")
        repo = WalkRepository(db_session)
        client_walk_id = uuid.uuid4()
        started_at = datetime(2026, 8, 1, 9, 0, 0, tzinfo=UTC)

        walk_a, created_a = _create_walk(
            repo, user_id=user_a.id, client_walk_id=client_walk_id, started_at=started_at
        )
        walk_b, created_b = _create_walk(
            repo, user_id=user_b.id, client_walk_id=client_walk_id, started_at=started_at
        )

        assert created_a is True
        assert created_b is True
        assert walk_a.id != walk_b.id


class TestDelete:
    def test_d_r1_deletes_own_walk_and_returns_true(self, db_session: Session) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)
        walk, _ = _create_walk(
            repo, user_id=user.id, started_at=datetime(2026, 8, 1, 9, 0, 0, tzinfo=UTC)
        )

        result = repo.delete(user_id=user.id, walk_id=walk.id)

        assert result is True
        assert db_session.get(type(walk), walk.id) is None

    def test_d_r2_other_users_walk_returns_false_and_row_remains(self, db_session: Session) -> None:
        owner = _make_user(db_session, subject="owner")
        other = _make_user(db_session, subject="other")
        repo = WalkRepository(db_session)
        walk, _ = _create_walk(
            repo, user_id=owner.id, started_at=datetime(2026, 8, 1, 9, 0, 0, tzinfo=UTC)
        )

        result = repo.delete(user_id=other.id, walk_id=walk.id)

        assert result is False
        assert db_session.get(type(walk), walk.id) is not None

    def test_d_r3_unknown_walk_id_returns_false(self, db_session: Session) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)

        result = repo.delete(user_id=user.id, walk_id=uuid.uuid4())

        assert result is False

    def test_d_r4_only_deletes_the_targeted_row(self, db_session: Session) -> None:
        owner = _make_user(db_session, subject="owner")
        other = _make_user(db_session, subject="other")
        repo = WalkRepository(db_session)
        base = datetime(2026, 8, 1, 9, 0, 0, tzinfo=UTC)
        target, _ = _create_walk(repo, user_id=owner.id, started_at=base)
        sibling, _ = _create_walk(repo, user_id=owner.id, started_at=base + timedelta(minutes=1))
        others_walk, _ = _create_walk(repo, user_id=other.id, started_at=base)

        result = repo.delete(user_id=owner.id, walk_id=target.id)

        assert result is True
        assert db_session.get(type(target), target.id) is None
        assert db_session.get(type(sibling), sibling.id) is not None
        assert db_session.get(type(others_walk), others_walk.id) is not None

    def test_d_r5_deletes_walk_with_large_track_points(self, db_session: Session) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)
        big_track = [[35.0 + i * 0.0001, 139.0] for i in range(500)]
        walk, _ = _create_walk(
            repo,
            user_id=user.id,
            started_at=datetime(2026, 8, 1, 9, 0, 0, tzinfo=UTC),
            track_points=big_track,
        )

        result = repo.delete(user_id=user.id, walk_id=walk.id)

        assert result is True
        assert db_session.get(type(walk), walk.id) is None


class TestGetById:
    def test_returns_none_for_other_users_walk(self, db_session: Session) -> None:
        owner = _make_user(db_session, subject="owner")
        other = _make_user(db_session, subject="other")
        repo = WalkRepository(db_session)
        walk, _ = _create_walk(
            repo, user_id=owner.id, started_at=datetime(2026, 8, 1, 9, 0, 0, tzinfo=UTC)
        )

        assert repo.get_by_id(user_id=other.id, walk_id=walk.id) is None
        assert repo.get_by_id(user_id=owner.id, walk_id=walk.id) is not None

    def test_returns_none_for_unknown_id(self, db_session: Session) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)

        assert repo.get_by_id(user_id=user.id, walk_id=uuid.uuid4()) is None


class TestListForUser:
    def test_only_returns_the_scoped_users_walks(self, db_session: Session) -> None:
        owner = _make_user(db_session, subject="owner")
        other = _make_user(db_session, subject="other")
        repo = WalkRepository(db_session)
        base = datetime(2026, 8, 1, 9, 0, 0, tzinfo=UTC)
        _create_walk(repo, user_id=owner.id, started_at=base)
        _create_walk(repo, user_id=other.id, started_at=base)

        rows = repo.list_for_user(user_id=owner.id, limit=10)

        assert len(rows) == 1
        assert rows[0].user_id == owner.id

    def test_orders_by_started_at_desc_then_id_desc(self, db_session: Session) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)
        base = datetime(2026, 8, 1, 9, 0, 0, tzinfo=UTC)

        walk_1, _ = _create_walk(repo, user_id=user.id, started_at=base)
        walk_2, _ = _create_walk(repo, user_id=user.id, started_at=base + timedelta(minutes=1))
        walk_3, _ = _create_walk(repo, user_id=user.id, started_at=base + timedelta(minutes=1))

        rows = repo.list_for_user(user_id=user.id, limit=10)

        assert rows[-1].id == walk_1.id  # 最も古い started_at は末尾
        # 同時刻の2件（walk_2, walk_3）は id DESC で決定的に並ぶ
        same_time_ids = sorted([walk_2.id, walk_3.id], reverse=True)
        assert [w.id for w in rows[:2]] == same_time_ids

    def test_limit_plus_one_signals_more_pages(self, db_session: Session) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)
        base = datetime(2026, 8, 1, 9, 0, 0, tzinfo=UTC)
        for i in range(3):
            _create_walk(repo, user_id=user.id, started_at=base + timedelta(minutes=i))

        rows = repo.list_for_user(user_id=user.id, limit=2)

        assert len(rows) == 3  # limit(2) + 1

    def test_keyset_cursor_continues_from_previous_page(self, db_session: Session) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)
        base = datetime(2026, 8, 1, 9, 0, 0, tzinfo=UTC)
        walks = []
        for i in range(5):
            walk, _ = _create_walk(repo, user_id=user.id, started_at=base + timedelta(minutes=i))
            walks.append(walk)
        # 期待順序: started_at DESC -> walks[4], walks[3], ..., walks[0]

        first_page = repo.list_for_user(user_id=user.id, limit=2)
        assert [w.id for w in first_page[:2]] == [walks[4].id, walks[3].id]

        cursor = (first_page[1].started_at, first_page[1].id)
        second_page = repo.list_for_user(user_id=user.id, limit=2, cursor=cursor)

        assert [w.id for w in second_page[:2]] == [walks[2].id, walks[1].id]

    def test_started_after_and_started_before_are_a_half_open_interval(
        self, db_session: Session
    ) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)
        base = datetime(2026, 8, 1, 0, 0, 0, tzinfo=UTC)
        walk_in, _ = _create_walk(repo, user_id=user.id, started_at=base)
        walk_boundary, _ = _create_walk(repo, user_id=user.id, started_at=base + timedelta(days=1))
        _create_walk(repo, user_id=user.id, started_at=base + timedelta(days=2))

        rows = repo.list_for_user(
            user_id=user.id,
            limit=10,
            started_after=base,
            started_before=base + timedelta(days=1),
        )

        ids = {w.id for w in rows}
        assert walk_in.id in ids
        assert walk_boundary.id not in ids  # started_before は半開区間（含まない）

    def test_does_not_select_track_points(self, db_session: Session) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)
        _create_walk(
            repo,
            user_id=user.id,
            started_at=datetime(2026, 8, 1, 9, 0, 0, tzinfo=UTC),
            track_points=[[35.0, 139.0]],
        )
        db_session.expire_all()

        rows = repo.list_for_user(user_id=user.id, limit=10)

        state = inspect(rows[0])
        assert "track_points" in state.unloaded


class TestAggregateDailyForUser:
    def test_r1_only_returns_the_scoped_users_rows(self, db_session: Session) -> None:
        owner = _make_user(db_session, subject="owner")
        other = _make_user(db_session, subject="other")
        repo = WalkRepository(db_session)
        started_at = datetime(2026, 3, 15, 3, 0, 0, tzinfo=UTC)
        _create_walk(repo, user_id=owner.id, started_at=started_at)
        _create_walk(repo, user_id=other.id, started_at=started_at)

        rows = repo.aggregate_daily_for_user(
            user_id=owner.id,
            timezone_name=WALK_STATS_TIMEZONE,
            started_at_from=started_at - timedelta(days=1),
            started_at_until=started_at + timedelta(days=1),
        )

        assert len(rows) == 1

    def test_r2_utc_1500_boundary_is_attributed_to_the_next_jst_day(
        self, db_session: Session
    ) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)
        # 2026-03-15T15:00:00Z == 2026-03-16T00:00:00+09:00
        started_at = datetime(2026, 3, 15, 15, 0, 0, tzinfo=UTC)
        _create_walk(repo, user_id=user.id, started_at=started_at)

        rows = repo.aggregate_daily_for_user(
            user_id=user.id,
            timezone_name=WALK_STATS_TIMEZONE,
            started_at_from=started_at - timedelta(days=1),
            started_at_until=started_at + timedelta(days=1),
        )

        assert len(rows) == 1
        assert rows[0].day == date(2026, 3, 16)

    def test_r3_attributed_to_start_date_not_end_date(self, db_session: Session) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)
        # JST 23:59 開始（UTC 14:59）・翌 00:30 終了。開始日に計上されるはず。
        started_at = datetime(2026, 3, 15, 14, 59, 0, tzinfo=UTC)
        repo.create(
            user_id=user.id,
            client_walk_id=uuid.uuid4(),
            started_at=started_at,
            ended_at=started_at + timedelta(minutes=31),
            duration_seconds=1800,
            distance_meters=1000,
            destination_place_id="place-1",
            destination_name="テスト公園",
            destination_latitude=35.68,
            destination_longitude=139.76,
            track_points=[],
        )

        rows = repo.aggregate_daily_for_user(
            user_id=user.id,
            timezone_name=WALK_STATS_TIMEZONE,
            started_at_from=started_at - timedelta(days=1),
            started_at_until=started_at + timedelta(days=1),
        )

        assert len(rows) == 1
        assert rows[0].day == date(2026, 3, 15)

    def test_r4_same_day_walks_are_summed_into_one_row(self, db_session: Session) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)
        base = datetime(2026, 3, 15, 1, 0, 0, tzinfo=UTC)
        _create_walk(repo, user_id=user.id, started_at=base)
        _create_walk(repo, user_id=user.id, started_at=base + timedelta(hours=2))

        rows = repo.aggregate_daily_for_user(
            user_id=user.id,
            timezone_name=WALK_STATS_TIMEZONE,
            started_at_from=base - timedelta(days=1),
            started_at_until=base + timedelta(days=1),
        )

        assert len(rows) == 1
        assert rows[0].walk_count == 2
        assert rows[0].duration_seconds == 1200
        assert rows[0].distance_meters == 2000

    def test_r5_window_bounds_are_a_half_open_interval(self, db_session: Session) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)
        window_from = datetime(2026, 3, 15, 0, 0, 0, tzinfo=UTC)
        window_until = datetime(2026, 3, 16, 0, 0, 0, tzinfo=UTC)
        _create_walk(repo, user_id=user.id, started_at=window_from)  # 下端: 含む
        _create_walk(repo, user_id=user.id, started_at=window_until)  # 上端: 含まない

        rows = repo.aggregate_daily_for_user(
            user_id=user.id,
            timezone_name=WALK_STATS_TIMEZONE,
            started_at_from=window_from,
            started_at_until=window_until,
        )

        total_walk_count = sum(row.walk_count for row in rows)
        assert total_walk_count == 1

    def test_r6_no_walks_returns_empty_list(self, db_session: Session) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)

        rows = repo.aggregate_daily_for_user(
            user_id=user.id,
            timezone_name=WALK_STATS_TIMEZONE,
            started_at_from=datetime(2026, 3, 1, tzinfo=UTC),
            started_at_until=datetime(2026, 3, 31, tzinfo=UTC),
        )

        assert rows == []

    def test_r7_does_not_select_track_points(self, db_session: Session) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)
        started_at = datetime(2026, 3, 15, 1, 0, 0, tzinfo=UTC)
        big_track = [[35.0 + i * 0.0001, 139.0] for i in range(500)]
        _create_walk(repo, user_id=user.id, started_at=started_at, track_points=big_track)

        rows = repo.aggregate_daily_for_user(
            user_id=user.id,
            timezone_name=WALK_STATS_TIMEZONE,
            started_at_from=started_at - timedelta(days=1),
            started_at_until=started_at + timedelta(days=1),
        )

        assert len(rows) == 1
        assert rows[0].walk_count == 1  # track の大きさに関わらず値が壊れず返る


class TestListWalkDatesDesc:
    def test_r8_returns_jst_dates_desc_with_duplicates(self, db_session: Session) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)
        base = datetime(2026, 3, 15, 1, 0, 0, tzinfo=UTC)
        _create_walk(repo, user_id=user.id, started_at=base)
        _create_walk(repo, user_id=user.id, started_at=base + timedelta(hours=1))
        _create_walk(repo, user_id=user.id, started_at=base - timedelta(days=1))

        dates = repo.list_walk_dates_desc(
            user_id=user.id,
            timezone_name=WALK_STATS_TIMEZONE,
            before=base + timedelta(days=1),
            limit=10,
        )

        assert dates == [date(2026, 3, 15), date(2026, 3, 15), date(2026, 3, 14)]

    def test_r9_limit_truncates_results(self, db_session: Session) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)
        base = datetime(2026, 3, 1, 1, 0, 0, tzinfo=UTC)
        for i in range(5):
            _create_walk(repo, user_id=user.id, started_at=base + timedelta(days=i))

        dates = repo.list_walk_dates_desc(
            user_id=user.id,
            timezone_name=WALK_STATS_TIMEZONE,
            before=base + timedelta(days=10),
            limit=2,
        )

        assert len(dates) == 2

    def test_r10_before_is_exclusive(self, db_session: Session) -> None:
        user = _make_user(db_session, subject="u1")
        repo = WalkRepository(db_session)
        started_at = datetime(2026, 3, 15, 1, 0, 0, tzinfo=UTC)
        _create_walk(repo, user_id=user.id, started_at=started_at)

        dates = repo.list_walk_dates_desc(
            user_id=user.id,
            timezone_name=WALK_STATS_TIMEZONE,
            before=started_at,
            limit=10,
        )

        assert dates == []

    def test_r11_only_returns_the_scoped_users_rows(self, db_session: Session) -> None:
        owner = _make_user(db_session, subject="owner")
        other = _make_user(db_session, subject="other")
        repo = WalkRepository(db_session)
        started_at = datetime(2026, 3, 15, 1, 0, 0, tzinfo=UTC)
        _create_walk(repo, user_id=owner.id, started_at=started_at)
        _create_walk(repo, user_id=other.id, started_at=started_at)

        dates = repo.list_walk_dates_desc(
            user_id=owner.id,
            timezone_name=WALK_STATS_TIMEZONE,
            before=started_at + timedelta(days=1),
            limit=10,
        )

        assert len(dates) == 1
