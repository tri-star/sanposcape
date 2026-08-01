import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from sanposcape.core.geo import GeoPoint
from sanposcape.walks.exceptions import WalkNotFoundError
from sanposcape.walks.repository import WalkRepository
from sanposcape.walks.schemas import WalkCreate, WalkDestinationCreate
from sanposcape.walks.service import WalkService
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
