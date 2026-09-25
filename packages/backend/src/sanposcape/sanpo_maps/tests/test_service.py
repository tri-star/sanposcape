import uuid
from collections.abc import Callable
from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from sanposcape.conftest import TestSessionLocal
from sanposcape.sanpo_maps.exceptions import SanpoMapNotFoundError, SanpoMapPermissionDeniedError
from sanposcape.sanpo_maps.models import SanpoMap, SanpoMapMember
from sanposcape.sanpo_maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.schemas import SanpoMapCreate, SanpoMapUpdate
from sanposcape.sanpo_maps.service import FIRST_SANPO_MAP_NAME, SanpoMapService
from sanposcape.sanpo_maps.tests.conftest import make_user


def make_service(db_session: Session, now: datetime | None = None) -> SanpoMapService:
    kwargs = {} if now is None else {"now": lambda: now}
    return SanpoMapService(db_session, SanpoMapRepository(db_session), **kwargs)


class FakeSanpoMapContents:
    """`sanpo_maps.contents.SanpoMapContents` を満たす fake（`pins` を import しない,
    Protocol の構造的部分型を利用する。plan の J2 と同じ理由でテストも pins に依存しない）。
    """

    def __init__(self, counts: dict[uuid.UUID, int] | None = None) -> None:
        self.counts = counts or {}
        self.count_calls: list[list[uuid.UUID]] = []
        self.prepared_ids: list[uuid.UUID] = []
        self.cleanup_calls: list[uuid.UUID] = []

    def count_pins_for_sanpo_maps(self, sanpo_map_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
        self.count_calls.append(list(sanpo_map_ids))
        return {
            sanpo_map_id: count
            for sanpo_map_id, count in self.counts.items()
            if sanpo_map_id in sanpo_map_ids
        }

    def prepare_sanpo_map_deletion(self, sanpo_map_id: uuid.UUID) -> Callable[[], None]:
        self.prepared_ids.append(sanpo_map_id)

        def cleanup() -> None:
            self.cleanup_calls.append(sanpo_map_id)

        return cleanup


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


class TestListMapsPinCount:
    def test_without_pin_counter_all_items_have_null_pin_count_and_fake_is_not_called(
        self, db_session: Session
    ) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        service._repository.create_with_owner(owner_user_id=user.id, name="地図", is_default=True)
        db_session.commit()
        fake = FakeSanpoMapContents()

        result = service.list_maps(user)

        assert result.items[0].pin_count is None
        assert fake.count_calls == []

    def test_with_pin_counter_calls_once_with_all_ids_and_fills_missing_with_zero(
        self, db_session: Session
    ) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        with_pins, _ = service._repository.create_with_owner(
            owner_user_id=user.id, name="ピンあり", is_default=True
        )
        without_pins, _ = service._repository.create_with_owner(
            owner_user_id=user.id, name="ピンなし", is_default=False
        )
        db_session.commit()
        fake = FakeSanpoMapContents(counts={with_pins.id: 3})

        result = service.list_maps(user, pin_counter=fake)

        assert len(fake.count_calls) == 1
        assert set(fake.count_calls[0]) == {with_pins.id, without_pins.id}
        pin_counts_by_id = {item.id: item.pin_count for item in result.items}
        assert pin_counts_by_id[with_pins.id] == 3
        assert pin_counts_by_id[without_pins.id] == 0


class TestCreateMap:
    def test_first_map_becomes_default(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)

        result = service.create_map(user, SanpoMapCreate(name="最初の地図"))

        assert result.is_default is True
        assert result.role == "owner"
        assert result.pin_count is None

    def test_second_map_is_not_default(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        service.create_map(user, SanpoMapCreate(name="1つ目"))

        result = service.create_map(user, SanpoMapCreate(name="2つ目"))

        assert result.is_default is False

    def test_commits_and_is_visible_from_another_session(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)

        result = service.create_map(user, SanpoMapCreate(name="地図"))

        other_session = TestSessionLocal()
        try:
            assert other_session.get(SanpoMap, result.id) is not None
        finally:
            other_session.close()


class TestUpdateMap:
    def test_owner_can_rename_without_touching_updated_at(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        created = service.create_map(user, SanpoMapCreate(name="旧名"))
        original_updated_at = created.updated_at

        result = service.update_map(user, created.id, SanpoMapUpdate(name="新名"))

        assert result.name == "新名"
        assert result.updated_at == original_updated_at

    def test_editor_sending_name_raises_permission_denied(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        service = make_service(db_session)
        sanpo_map, _ = service._repository.create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.add(SanpoMapMember(sanpo_map_id=sanpo_map.id, user_id=editor.id, role="editor"))
        db_session.commit()

        with pytest.raises(SanpoMapPermissionDeniedError):
            service.update_map(editor, sanpo_map.id, SanpoMapUpdate(name="改名"))

    def test_editor_sending_empty_body_succeeds(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        service = make_service(db_session)
        sanpo_map, _ = service._repository.create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.add(SanpoMapMember(sanpo_map_id=sanpo_map.id, user_id=editor.id, role="editor"))
        db_session.commit()

        result = service.update_map(editor, sanpo_map.id, SanpoMapUpdate())

        assert result.name == "地図"
        assert result.role == "editor"

    def test_non_member_raises_not_found(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        service = make_service(db_session)
        sanpo_map, _ = service._repository.create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.commit()

        with pytest.raises(SanpoMapNotFoundError):
            service.update_map(stranger, sanpo_map.id, SanpoMapUpdate(name="改名"))


class TestDeleteMap:
    def test_owner_deletes_map_and_member_row(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        created = service.create_map(user, SanpoMapCreate(name="地図"))
        fake = FakeSanpoMapContents()

        service.delete_map(user, created.id, contents=fake)

        assert db_session.get(SanpoMap, created.id) is None
        assert db_session.get(SanpoMapMember, (created.id, user.id)) is None

    def test_cleanup_is_called_after_commit(self, db_session: Session) -> None:
        """後始末関数が呼ばれた時点で、別セッションから地図が見えないこと
        （commit 後に呼ばれることの確認）。
        """
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        created = service.create_map(user, SanpoMapCreate(name="地図"))
        visible_during_cleanup: list[bool] = []

        class RecordingContents(FakeSanpoMapContents):
            def prepare_sanpo_map_deletion(self, sanpo_map_id: uuid.UUID) -> Callable[[], None]:
                inner = super().prepare_sanpo_map_deletion(sanpo_map_id)

                def cleanup() -> None:
                    other_session = TestSessionLocal()
                    try:
                        visible_during_cleanup.append(
                            other_session.get(SanpoMap, sanpo_map_id) is not None
                        )
                    finally:
                        other_session.close()
                    inner()

                return cleanup

        service.delete_map(user, created.id, contents=RecordingContents())

        assert visible_during_cleanup == [False]

    def test_editor_raises_permission_denied_and_does_not_prepare_deletion(
        self, db_session: Session
    ) -> None:
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        service = make_service(db_session)
        sanpo_map, _ = service._repository.create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.add(SanpoMapMember(sanpo_map_id=sanpo_map.id, user_id=editor.id, role="editor"))
        db_session.commit()
        fake = FakeSanpoMapContents()

        with pytest.raises(SanpoMapPermissionDeniedError):
            service.delete_map(editor, sanpo_map.id, contents=fake)

        assert fake.prepared_ids == []
        assert db_session.get(SanpoMap, sanpo_map.id) is not None

    def test_non_member_raises_not_found(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        service = make_service(db_session)
        sanpo_map, _ = service._repository.create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.commit()
        fake = FakeSanpoMapContents()

        with pytest.raises(SanpoMapNotFoundError):
            service.delete_map(stranger, sanpo_map.id, contents=fake)

    def test_deleting_default_map_promotes_the_next_one(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        default_map = service.create_map(user, SanpoMapCreate(name="既定"))
        other_map = service.create_map(user, SanpoMapCreate(name="非既定"))
        fake = FakeSanpoMapContents()

        service.delete_map(user, default_map.id, contents=fake)

        refreshed = db_session.get(SanpoMap, other_map.id)
        assert refreshed is not None
        assert refreshed.is_default is True

    def test_deleting_non_default_map_does_not_change_default(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        default_map = service.create_map(user, SanpoMapCreate(name="既定"))
        other_map = service.create_map(user, SanpoMapCreate(name="非既定"))
        fake = FakeSanpoMapContents()

        service.delete_map(user, other_map.id, contents=fake)

        refreshed = db_session.get(SanpoMap, default_map.id)
        assert refreshed is not None
        assert refreshed.is_default is True
