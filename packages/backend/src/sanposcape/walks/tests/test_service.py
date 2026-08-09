import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from sanposcape.core.geo import GeoPoint
from sanposcape.walks import service as service_module
from sanposcape.walks.exceptions import WalkNotFoundError
from sanposcape.walks.repository import WalkRepository
from sanposcape.walks.schemas import WalkCreate, WalkDestinationCreate
from sanposcape.walks.service import WalkService
from sanposcape.walks.tests.conftest import STATS_ANCHOR_JST, STATS_ANCHOR_UTC, seed_walk
from sanposcape.walks.tests.conftest import make_user as _make_user


def _make_service(db_session: Session) -> WalkService:
    return WalkService(db_session, WalkRepository(db_session))


def _make_payload(
    *, client_walk_id: uuid.UUID | None = None, started_at: datetime | None = None
) -> WalkCreate:
    ended_at = started_at + timedelta(minutes=10) if started_at else None
    if started_at is None:
        ended_at = datetime.now(UTC) - timedelta(minutes=1)
        started_at = ended_at - timedelta(minutes=10)
    return WalkCreate(
        client_walk_id=client_walk_id or uuid.uuid4(),
        started_at=started_at,
        ended_at=ended_at,
        duration_seconds=590,
        distance_meters=1200,
        destination=WalkDestinationCreate(
            place_id="place-1",
            name="テスト公園",
            location=GeoPoint(latitude=35.68, longitude=139.76),
        ),
        track=[GeoPoint(latitude=35.68, longitude=139.76)],
    )


class TestRecordWalk:
    def test_creates_new_walk_with_created_true(self, db_session: Session) -> None:
        service = _make_service(db_session)
        user = _make_user(db_session, subject="u1")

        walk, created = service.record_walk(user, _make_payload())

        assert created is True
        assert walk.distance_meters == 1200

    def test_resend_with_same_client_walk_id_returns_created_false(
        self, db_session: Session
    ) -> None:
        service = _make_service(db_session)
        user = _make_user(db_session, subject="u1")
        client_walk_id = uuid.uuid4()
        payload = _make_payload(client_walk_id=client_walk_id)

        first, first_created = service.record_walk(user, payload)
        second, second_created = service.record_walk(user, payload)

        assert first_created is True
        assert second_created is False
        assert first.id == second.id


class TestListWalks:
    def test_next_cursor_is_null_when_all_items_fit_in_one_page(self, db_session: Session) -> None:
        service = _make_service(db_session)
        user = _make_user(db_session, subject="u1")
        base = datetime.now(UTC) - timedelta(days=1)
        for i in range(3):
            service.record_walk(user, _make_payload(started_at=base + timedelta(minutes=i)))

        result = service.list_walks(
            user, limit=10, cursor=None, started_after=None, started_before=None
        )

        assert len(result.items) == 3
        assert result.next_cursor is None

    def test_next_cursor_is_set_when_more_items_remain(self, db_session: Session) -> None:
        service = _make_service(db_session)
        user = _make_user(db_session, subject="u1")
        base = datetime.now(UTC) - timedelta(days=1)
        for i in range(3):
            service.record_walk(user, _make_payload(started_at=base + timedelta(minutes=i)))

        result = service.list_walks(
            user, limit=2, cursor=None, started_after=None, started_before=None
        )

        assert len(result.items) == 2
        assert result.next_cursor is not None

    def test_next_cursor_allows_fetching_remaining_items(self, db_session: Session) -> None:
        service = _make_service(db_session)
        user = _make_user(db_session, subject="u1")
        base = datetime.now(UTC) - timedelta(days=1)
        for i in range(3):
            service.record_walk(user, _make_payload(started_at=base + timedelta(minutes=i)))

        first_page = service.list_walks(
            user, limit=2, cursor=None, started_after=None, started_before=None
        )
        second_page = service.list_walks(
            user,
            limit=2,
            cursor=first_page.next_cursor,
            started_after=None,
            started_before=None,
        )

        assert len(second_page.items) == 1
        assert second_page.next_cursor is None
        first_ids = {item.id for item in first_page.items}
        assert second_page.items[0].id not in first_ids


class TestGetWalk:
    def test_returns_walk_detail_with_track(self, db_session: Session) -> None:
        service = _make_service(db_session)
        user = _make_user(db_session, subject="u1")
        walk, _ = service.record_walk(user, _make_payload())

        detail = service.get_walk(user, walk.id)

        assert detail.id == walk.id
        assert detail.track == [GeoPoint(latitude=35.68, longitude=139.76)]

    def test_raises_not_found_for_other_users_walk(self, db_session: Session) -> None:
        service = _make_service(db_session)
        owner = _make_user(db_session, subject="owner")
        other = _make_user(db_session, subject="other")
        walk, _ = service.record_walk(owner, _make_payload())

        with pytest.raises(WalkNotFoundError):
            service.get_walk(other, walk.id)

    def test_raises_not_found_for_unknown_id(self, db_session: Session) -> None:
        service = _make_service(db_session)
        user = _make_user(db_session, subject="u1")

        with pytest.raises(WalkNotFoundError):
            service.get_walk(user, uuid.uuid4())


ANCHOR_DATE = STATS_ANCHOR_JST.date()  # 2026-03-15（日曜）


def _make_stats_service(db_session: Session) -> WalkService:
    return WalkService(db_session, WalkRepository(db_session), now=lambda: STATS_ANCHOR_UTC)


def _jst(day, hour: int = 12, minute: int = 0) -> datetime:
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=STATS_ANCHOR_JST.tzinfo)


def _bucket_for(period, day):
    return next(b for b in period.buckets if b.start_date == day)


class TestGetWalkStats:
    def test_s1_no_walks_returns_all_zero(self, db_session: Session) -> None:
        service = _make_stats_service(db_session)
        user = _make_user(db_session, subject="u1")

        result = service.get_walk_stats(user)

        assert len(result.week.buckets) == 7
        assert len(result.month.buckets) == 4
        assert all(b.walk_count == 0 for b in result.week.buckets)
        assert all(b.walk_count == 0 for b in result.month.buckets)
        assert result.week.total_walk_count == 0
        assert result.month.total_walk_count == 0
        assert result.streak_days == 0
        assert result.today.date == ANCHOR_DATE
        assert result.today.walk_count == 0

    def test_s2_walk_ending_next_day_is_attributed_to_start_date(self, db_session: Session) -> None:
        service = _make_stats_service(db_session)
        user = _make_user(db_session, subject="u1")
        day = ANCHOR_DATE - timedelta(days=1)
        seed_walk(db_session, user_id=user.id, started_at=_jst(day, 23, 59))

        result = service.get_walk_stats(user)

        assert _bucket_for(result.week, day).walk_count == 1
        assert _bucket_for(result.week, ANCHOR_DATE).walk_count == 0

    def test_s3_utc_1500_boundary_is_attributed_to_the_next_jst_day(
        self, db_session: Session
    ) -> None:
        service = _make_stats_service(db_session)
        user = _make_user(db_session, subject="u1")
        day_before = ANCHOR_DATE - timedelta(days=1)
        # 2026-03-14T15:00:00Z == 2026-03-15T00:00:00+09:00（= ANCHOR_DATE の開始）
        started_at = datetime(day_before.year, day_before.month, day_before.day, 15, 0, tzinfo=UTC)
        seed_walk(db_session, user_id=user.id, started_at=started_at)

        result = service.get_walk_stats(user)

        assert result.today.walk_count == 1
        assert _bucket_for(result.week, day_before).walk_count == 0

    def test_s4_no_walk_today_streak_continues_from_yesterday(self, db_session: Session) -> None:
        service = _make_stats_service(db_session)
        user = _make_user(db_session, subject="u1")
        seed_walk(db_session, user_id=user.id, started_at=_jst(ANCHOR_DATE - timedelta(days=1)))
        seed_walk(db_session, user_id=user.id, started_at=_jst(ANCHOR_DATE - timedelta(days=2)))

        result = service.get_walk_stats(user)

        assert result.streak_days == 2

    def test_s5_walk_today_no_walk_yesterday(self, db_session: Session) -> None:
        service = _make_stats_service(db_session)
        user = _make_user(db_session, subject="u1")
        seed_walk(db_session, user_id=user.id, started_at=_jst(ANCHOR_DATE))

        result = service.get_walk_stats(user)

        assert result.streak_days == 1

    def test_s6_two_walks_same_day_count_once_for_streak(self, db_session: Session) -> None:
        service = _make_stats_service(db_session)
        user = _make_user(db_session, subject="u1")
        seed_walk(db_session, user_id=user.id, started_at=_jst(ANCHOR_DATE, 8, 0))
        seed_walk(db_session, user_id=user.id, started_at=_jst(ANCHOR_DATE, 18, 0))

        result = service.get_walk_stats(user)

        assert result.today.walk_count == 2
        assert result.streak_days == 1

    def test_s7_neither_today_nor_yesterday_streak_is_zero(self, db_session: Session) -> None:
        service = _make_stats_service(db_session)
        user = _make_user(db_session, subject="u1")
        seed_walk(db_session, user_id=user.id, started_at=_jst(ANCHOR_DATE - timedelta(days=3)))

        result = service.get_walk_stats(user)

        assert result.streak_days == 0

    def test_s8_thirty_consecutive_days_exceeds_the_window(self, db_session: Session) -> None:
        service = _make_stats_service(db_session)
        user = _make_user(db_session, subject="u1")
        for i in range(30):
            seed_walk(db_session, user_id=user.id, started_at=_jst(ANCHOR_DATE - timedelta(days=i)))

        result = service.get_walk_stats(user)

        assert result.streak_days == 30

    def test_s9_streak_continues_across_chunk_boundaries(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(service_module, "WALK_STATS_STREAK_CHUNK_SIZE", 3)
        service = _make_stats_service(db_session)
        user = _make_user(db_session, subject="u1")
        for i in range(10):
            seed_walk(db_session, user_id=user.id, started_at=_jst(ANCHOR_DATE - timedelta(days=i)))

        result = service.get_walk_stats(user)

        assert result.streak_days == 10

    def test_s10_week_totals_match_bucket_sums(self, db_session: Session) -> None:
        service = _make_stats_service(db_session)
        user = _make_user(db_session, subject="u1")
        seed_walk(
            db_session,
            user_id=user.id,
            started_at=_jst(ANCHOR_DATE),
            duration_seconds=300,
            distance_meters=500,
        )
        seed_walk(
            db_session,
            user_id=user.id,
            started_at=_jst(ANCHOR_DATE - timedelta(days=3)),
            duration_seconds=700,
            distance_meters=900,
        )

        result = service.get_walk_stats(user)

        assert result.week.total_walk_count == sum(b.walk_count for b in result.week.buckets)
        assert result.week.total_duration_seconds == sum(
            b.duration_seconds for b in result.week.buckets
        )
        assert result.week.total_distance_meters == sum(
            b.distance_meters for b in result.week.buckets
        )
        assert result.week.start_date == ANCHOR_DATE - timedelta(days=6)
        assert result.week.end_date == ANCHOR_DATE

    def test_s11_month_bucket_boundaries(self, db_session: Session) -> None:
        service = _make_stats_service(db_session)
        user = _make_user(db_session, subject="u1")

        result = service.get_walk_stats(user)

        assert len(result.month.buckets) == 4
        assert all((b.end_date - b.start_date).days == 6 for b in result.month.buckets)
        assert result.month.start_date == ANCHOR_DATE - timedelta(days=27)
        assert result.month.end_date == ANCHOR_DATE
        current_flags = [b.is_current for b in result.month.buckets]
        assert current_flags == [False, False, False, True]

    def test_s12_walk_outside_the_window_is_excluded_from_month_but_counts_for_streak(
        self, db_session: Session
    ) -> None:
        service = _make_stats_service(db_session)
        user = _make_user(db_session, subject="u1")
        # 29日連続（今日から29日前まで）: month(28日窓)には収まらないが streak は数える
        for i in range(29):
            seed_walk(db_session, user_id=user.id, started_at=_jst(ANCHOR_DATE - timedelta(days=i)))

        result = service.get_walk_stats(user)

        assert result.month.total_walk_count == 28  # 窓の外(29日前)は含まれない
        assert result.streak_days == 29  # streak には効く

    def test_s13_other_users_walks_do_not_leak(self, db_session: Session) -> None:
        service = _make_stats_service(db_session)
        owner = _make_user(db_session, subject="owner")
        other = _make_user(db_session, subject="other")
        seed_walk(db_session, user_id=other.id, started_at=_jst(ANCHOR_DATE))
        seed_walk(db_session, user_id=other.id, started_at=_jst(ANCHOR_DATE - timedelta(days=1)))

        result = service.get_walk_stats(owner)

        assert result.today.walk_count == 0
        assert result.streak_days == 0

    def test_s14_future_walk_is_excluded(self, db_session: Session) -> None:
        service = _make_stats_service(db_session)
        user = _make_user(db_session, subject="u1")
        seed_walk(db_session, user_id=user.id, started_at=_jst(ANCHOR_DATE + timedelta(days=1)))

        result = service.get_walk_stats(user)

        assert result.today.walk_count == 0
        assert result.streak_days == 0
        assert result.week.total_walk_count == 0

    def test_s15_generated_at_and_timezone(self, db_session: Session) -> None:
        service = _make_stats_service(db_session)
        user = _make_user(db_session, subject="u1")

        result = service.get_walk_stats(user)

        assert result.generated_at == STATS_ANCHOR_UTC
        assert result.timezone == "Asia/Tokyo"
