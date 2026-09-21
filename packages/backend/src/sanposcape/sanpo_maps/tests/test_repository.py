from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from sanposcape.sanpo_maps.models import SanpoMap, SanpoMapMember
from sanposcape.sanpo_maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.tests.conftest import make_user


class TestListForMember:
    def test_own_default_map_is_first(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        other_map, _ = repo.create_with_owner(
            owner_user_id=user.id, name="他の地図", is_default=False
        )
        default_map, _ = repo.create_with_owner(
            owner_user_id=user.id, name="最初の地図", is_default=True
        )
        db_session.commit()

        rows = repo.list_for_member(user_id=user.id)

        assert [m.id for m, _role in rows] == [default_map.id, other_map.id]
        assert all(role == "owner" for _m, role in rows)

    def test_orders_non_default_maps_by_updated_at_desc(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        older, _ = repo.create_with_owner(owner_user_id=user.id, name="古い", is_default=False)
        newer, _ = repo.create_with_owner(owner_user_id=user.id, name="新しい", is_default=False)
        db_session.commit()
        repo.touch(sanpo_map_id=older.id, now=datetime.now(UTC) + timedelta(hours=1))
        db_session.commit()

        rows = repo.list_for_member(user_id=user.id)

        assert [m.id for m, _role in rows] == [older.id, newer.id]

    def test_other_users_map_is_not_returned(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        repo = SanpoMapRepository(db_session)
        repo.create_with_owner(owner_user_id=owner.id, name="地図", is_default=True)
        db_session.commit()

        assert repo.list_for_member(user_id=stranger.id) == []

    def test_editor_of_others_default_map_sees_role_editor(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=owner.id, name="地図", is_default=True)
        db_session.add(SanpoMapMember(sanpo_map_id=sanpo_map.id, user_id=editor.id, role="editor"))
        db_session.commit()

        rows = repo.list_for_member(user_id=editor.id)

        assert rows == [(sanpo_map, "editor")]

    def test_no_maps_returns_empty_list(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        assert repo.list_for_member(user_id=user.id) == []


class TestGetMembership:
    def test_returns_map_and_role_for_member(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=user.id, name="地図", is_default=True)
        db_session.commit()

        result = repo.get_membership(user_id=user.id, sanpo_map_id=sanpo_map.id)

        assert result == (sanpo_map, "owner")

    def test_returns_none_for_non_member(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=owner.id, name="地図", is_default=True)
        db_session.commit()

        assert repo.get_membership(user_id=stranger.id, sanpo_map_id=sanpo_map.id) is None


class TestGetDefaultForOwner:
    def test_returns_default_map(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        repo.create_with_owner(owner_user_id=user.id, name="非既定", is_default=False)
        default_map, _ = repo.create_with_owner(owner_user_id=user.id, name="既定", is_default=True)
        db_session.commit()

        assert repo.get_default_for_owner(owner_user_id=user.id) == default_map

    def test_returns_none_when_no_default(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        assert repo.get_default_for_owner(owner_user_id=user.id) is None


class TestCreateWithOwner:
    def test_creates_map_and_owner_member_row(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)

        sanpo_map, created = repo.create_with_owner(
            owner_user_id=user.id, name="最初の地図", is_default=True
        )
        db_session.commit()

        assert created is True
        assert sanpo_map.owner_user_id == user.id
        member = db_session.get(SanpoMapMember, (sanpo_map.id, user.id))
        assert member is not None
        assert member.role == "owner"

    def test_concurrent_default_creation_returns_single_existing_map(
        self, db_session: Session
    ) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        first, first_created = repo.create_with_owner(
            owner_user_id=user.id, name="1つ目", is_default=True
        )
        db_session.commit()

        second, second_created = repo.create_with_owner(
            owner_user_id=user.id, name="2つ目", is_default=True
        )

        assert first_created is True
        assert second_created is False
        assert second.id == first.id
        # 2つ目の地図の INSERT は savepoint ごとロールバックされているため、
        # このユーザーの地図は1件のまま。
        assert len(repo.list_for_member(user_id=user.id)) == 1


class TestTouch:
    def test_updates_updated_at(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=user.id, name="地図", is_default=True)
        db_session.commit()
        new_time = datetime.now(UTC) + timedelta(days=1)

        repo.touch(sanpo_map_id=sanpo_map.id, now=new_time)
        db_session.commit()

        refreshed = db_session.get(SanpoMap, sanpo_map.id)
        assert refreshed is not None
        assert refreshed.updated_at == new_time
