from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from sanposcape.sanpo_maps.exceptions import SanpoMapNotFoundError
from sanposcape.sanpo_maps.models import SanpoMapMember
from sanposcape.sanpo_maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.service import FIRST_SANPO_MAP_NAME, SanpoMapService
from sanposcape.sanpo_maps.tests.conftest import make_user


def make_service(db_session: Session, now: datetime | None = None) -> SanpoMapService:
    kwargs = {} if now is None else {"now": lambda: now}
    return SanpoMapService(db_session, SanpoMapRepository(db_session), **kwargs)


class TestListMaps:
    def test_own_default_map_has_is_default_true(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        service._repository.create_with_owner(owner_user_id=user.id, name="地図", is_default=True)
        db_session.commit()

        result = service.list_maps(user)

        assert len(result.items) == 1
        assert result.items[0].is_default is True
        assert result.items[0].role == "owner"
        assert result.next_cursor is None

    def test_editor_of_others_default_map_has_is_default_false(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        service = make_service(db_session)
        sanpo_map, _ = service._repository.create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.add(SanpoMapMember(sanpo_map_id=sanpo_map.id, user_id=editor.id, role="editor"))
        db_session.commit()

        result = service.list_maps(editor)

        assert len(result.items) == 1
        assert result.items[0].is_default is False
        assert result.items[0].role == "editor"

    def test_no_maps_returns_empty_items(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        result = service.list_maps(user)
        assert result.items == []


class TestResolveMapForNewPin:
    def test_explicit_id_for_member_returns_map_and_role(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        sanpo_map, _ = service._repository.create_with_owner(
            owner_user_id=user.id, name="地図", is_default=False
        )
        db_session.commit()

        resolved = service.resolve_map_for_new_pin(user, sanpo_map.id)

        assert resolved.sanpo_map.id == sanpo_map.id
        assert resolved.role == "owner"

    def test_explicit_id_for_non_member_raises_not_found(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        service = make_service(db_session)
        sanpo_map, _ = service._repository.create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=False
        )
        db_session.commit()

        with pytest.raises(SanpoMapNotFoundError):
            service.resolve_map_for_new_pin(stranger, sanpo_map.id)

    def test_omitted_id_creates_first_map_when_absent(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)

        resolved = service.resolve_map_for_new_pin(user, None)

        assert resolved.sanpo_map.name == FIRST_SANPO_MAP_NAME
        assert resolved.sanpo_map.is_default is True
        assert resolved.role == "owner"

    def test_omitted_id_reuses_existing_default_map(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        existing, _ = service._repository.create_with_owner(
            owner_user_id=user.id, name="既存の既定地図", is_default=True
        )
        db_session.commit()

        resolved = service.resolve_map_for_new_pin(user, None)

        assert resolved.sanpo_map.id == existing.id
        assert resolved.sanpo_map.name == "既存の既定地図"


class TestGetRole:
    def test_returns_role_for_member(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        sanpo_map, _ = service._repository.create_with_owner(
            owner_user_id=user.id, name="地図", is_default=True
        )
        db_session.commit()

        assert service.get_role(user, sanpo_map.id) == "owner"

    def test_returns_none_for_non_member(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        service = make_service(db_session)
        sanpo_map, _ = service._repository.create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.commit()

        assert service.get_role(stranger, sanpo_map.id) is None


class TestMarkUsed:
    def test_updates_updated_at_using_injected_clock(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        fixed_now = datetime(2026, 1, 1, tzinfo=UTC)
        service = make_service(db_session, now=fixed_now)
        sanpo_map, _ = service._repository.create_with_owner(
            owner_user_id=user.id, name="地図", is_default=True
        )
        db_session.commit()

        service.mark_used(sanpo_map.id)
        db_session.commit()

        rows = service._repository.list_for_member(user_id=user.id)
        assert rows[0][0].updated_at == fixed_now
