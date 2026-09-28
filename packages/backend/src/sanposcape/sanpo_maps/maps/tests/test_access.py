from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from sanposcape.sanpo_maps.conftest import make_user
from sanposcape.sanpo_maps.exceptions import SanpoMapNotFoundError
from sanposcape.sanpo_maps.maps.access import FIRST_SANPO_MAP_NAME, SanpoMapAccess
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository


def make_access(db_session: Session, now: datetime | None = None) -> SanpoMapAccess:
    kwargs = {} if now is None else {"now": lambda: now}
    return SanpoMapAccess(SanpoMapRepository(db_session), **kwargs)


class TestResolveMapForNewPin:
    def test_explicit_id_for_member_returns_map_and_role(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        access = make_access(db_session)
        sanpo_map, _ = access._repository.create_with_owner(
            owner_user_id=user.id, name="地図", is_default=False
        )
        db_session.commit()

        resolved = access.resolve_map_for_new_pin(user, sanpo_map.id)

        assert resolved.sanpo_map.id == sanpo_map.id
        assert resolved.role == "owner"

    def test_explicit_id_for_non_member_raises_not_found(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        access = make_access(db_session)
        sanpo_map, _ = access._repository.create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=False
        )
        db_session.commit()

        with pytest.raises(SanpoMapNotFoundError):
            access.resolve_map_for_new_pin(stranger, sanpo_map.id)

    def test_omitted_id_creates_first_map_when_absent(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        access = make_access(db_session)

        resolved = access.resolve_map_for_new_pin(user, None)

        assert resolved.sanpo_map.name == FIRST_SANPO_MAP_NAME
        assert resolved.sanpo_map.is_default is True
        assert resolved.role == "owner"

    def test_omitted_id_reuses_existing_default_map(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        access = make_access(db_session)
        existing, _ = access._repository.create_with_owner(
            owner_user_id=user.id, name="既存の既定地図", is_default=True
        )
        db_session.commit()

        resolved = access.resolve_map_for_new_pin(user, None)

        assert resolved.sanpo_map.id == existing.id
        assert resolved.sanpo_map.name == "既存の既定地図"


class TestGetRole:
    def test_returns_role_for_member(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        access = make_access(db_session)
        sanpo_map, _ = access._repository.create_with_owner(
            owner_user_id=user.id, name="地図", is_default=True
        )
        db_session.commit()

        assert access.get_role(user, sanpo_map.id) == "owner"

    def test_returns_none_for_non_member(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        access = make_access(db_session)
        sanpo_map, _ = access._repository.create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.commit()

        assert access.get_role(stranger, sanpo_map.id) is None


class TestMarkUsed:
    def test_updates_updated_at_using_injected_clock(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        fixed_now = datetime(2026, 1, 1, tzinfo=UTC)
        access = make_access(db_session, now=fixed_now)
        sanpo_map, _ = access._repository.create_with_owner(
            owner_user_id=user.id, name="地図", is_default=True
        )
        db_session.commit()

        access.mark_used(sanpo_map.id)
        db_session.commit()

        rows = access._repository.list_for_member(user_id=user.id)
        assert rows[0][0].updated_at == fixed_now
