import uuid
from collections.abc import Callable

import pytest
from sqlalchemy.orm import Session

from sanposcape.conftest import TestSessionLocal
from sanposcape.sanpo_maps.conftest import (
    create_pin_photo_row,
    create_pin_with_tags,
    make_user,
)
from sanposcape.sanpo_maps.exceptions import SanpoMapNotFoundError, SanpoMapPermissionDeniedError
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.maps.schemas import (
    SanpoMapCreate,
    SanpoMapTagListRead,
    SanpoMapUpdate,
)
from sanposcape.sanpo_maps.maps.service import SanpoMapService
from sanposcape.sanpo_maps.models import SanpoMap, SanpoMapIcon, SanpoMapMember
from sanposcape.sanpo_maps.pins.repository import PinRepository


class SpyPhotoCleaner:
    """`PhotoObjectCleaner` を duck typing で満たす spy（`delete_best_effort(keys)` の
    呼び出しを記録するだけ、ADR-011）。継承せず構造的部分型に頼る。
    """

    def __init__(self) -> None:
        self.calls: list[list[str]] = []
        self.on_delete: Callable[[list[str]], None] | None = None

    def delete_best_effort(self, keys: list[str]) -> None:
        self.calls.append(list(keys))
        if self.on_delete is not None:
            self.on_delete(keys)


def make_service(
    db_session: Session, photo_cleaner: SpyPhotoCleaner | None = None
) -> SanpoMapService:
    return SanpoMapService(
        db_session, SanpoMapRepository(db_session), photo_cleaner or SpyPhotoCleaner()
    )


def _create_pin(db_session: Session, *, sanpo_map_id: uuid.UUID, user_id: uuid.UUID) -> None:
    PinRepository(db_session).create(
        sanpo_map_id=sanpo_map_id,
        created_by_user_id=user_id,
        client_pin_id=uuid.uuid4(),
        name=None,
        memo=None,
        latitude=0,
        longitude=0,
        client_walk_id=None,
    )


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


class TestListMapsIcon:
    def test_each_map_has_its_own_saved_icon(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        first = service.create_map(user, SanpoMapCreate(name="1つ目", icon=SanpoMapIcon.TREE))
        second = service.create_map(user, SanpoMapCreate(name="2つ目", icon=SanpoMapIcon.BOOK))

        result = service.list_maps(user)

        assert {item.id: item.icon for item in result.items} == {
            first.id: SanpoMapIcon.TREE,
            second.id: SanpoMapIcon.BOOK,
        }


class TestListMapsPinCount:
    def test_without_include_pin_count_all_items_have_null_pin_count_and_repository_is_not_called(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        service._repository.create_with_owner(owner_user_id=user.id, name="地図", is_default=True)
        db_session.commit()
        calls: list[list[uuid.UUID]] = []
        original = service._repository.count_pins_for_maps

        def spy_count_pins_for_maps(sanpo_map_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
            calls.append(list(sanpo_map_ids))
            return original(sanpo_map_ids)

        monkeypatch.setattr(service._repository, "count_pins_for_maps", spy_count_pins_for_maps)

        result = service.list_maps(user)

        assert result.items[0].pin_count is None
        assert calls == []

    def test_with_include_pin_count_calls_once_with_all_ids_and_fills_missing_with_zero(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
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
        _create_pin(db_session, sanpo_map_id=with_pins.id, user_id=user.id)
        db_session.commit()
        calls: list[list[uuid.UUID]] = []
        original = service._repository.count_pins_for_maps

        def spy_count_pins_for_maps(sanpo_map_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
            calls.append(list(sanpo_map_ids))
            return original(sanpo_map_ids)

        monkeypatch.setattr(service._repository, "count_pins_for_maps", spy_count_pins_for_maps)

        result = service.list_maps(user, include_pin_count=True)

        assert len(calls) == 1
        assert set(calls[0]) == {with_pins.id, without_pins.id}
        pin_counts_by_id = {item.id: item.pin_count for item in result.items}
        assert pin_counts_by_id[with_pins.id] == 1
        assert pin_counts_by_id[without_pins.id] == 0


class TestCreateMap:
    def test_first_map_becomes_default(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)

        result = service.create_map(user, SanpoMapCreate(name="最初の地図"))

        assert result.is_default is True
        assert result.role == "owner"
        assert result.pin_count is None

    def test_saves_given_icon(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)

        result = service.create_map(user, SanpoMapCreate(name="地図", icon=SanpoMapIcon.COFFEE))

        assert result.icon == SanpoMapIcon.COFFEE

    def test_icon_defaults_to_pin(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)

        result = service.create_map(user, SanpoMapCreate(name="地図"))

        assert result.icon == SanpoMapIcon.PIN

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

    def test_takes_owner_lock_before_checking_default(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """PR #103 レビュー対応: 既定地図の不変条件（決定27）を守るため、owner 単位の
        advisory lock を `get_default_for_owner()` より前に取ることを固定する
        （真の同時実行は再現せず、呼び出し順序だけを確認する）。
        """
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        call_order: list[tuple[str, uuid.UUID]] = []
        original_lock_owner = service._repository.lock_owner
        original_get_default = service._repository.get_default_for_owner

        def spy_lock_owner(owner_user_id: uuid.UUID) -> None:
            call_order.append(("lock_owner", owner_user_id))
            original_lock_owner(owner_user_id)

        def spy_get_default(*, owner_user_id: uuid.UUID) -> object:
            call_order.append(("get_default_for_owner", owner_user_id))
            return original_get_default(owner_user_id=owner_user_id)

        monkeypatch.setattr(service._repository, "lock_owner", spy_lock_owner)
        monkeypatch.setattr(service._repository, "get_default_for_owner", spy_get_default)

        service.create_map(user, SanpoMapCreate(name="地図"))

        assert [name for name, _user_id in call_order] == ["lock_owner", "get_default_for_owner"]
        assert all(user_id == user.id for _name, user_id in call_order)


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

    def test_owner_can_change_icon_without_touching_name_or_updated_at(
        self, db_session: Session
    ) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        created = service.create_map(user, SanpoMapCreate(name="地図"))

        result = service.update_map(user, created.id, SanpoMapUpdate(icon=SanpoMapIcon.DOG))

        assert result.icon == SanpoMapIcon.DOG
        assert result.name == "地図"
        assert result.updated_at == created.updated_at

    def test_owner_can_change_name_and_icon_together(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        created = service.create_map(user, SanpoMapCreate(name="旧名"))

        result = service.update_map(
            user, created.id, SanpoMapUpdate(name="新名", icon=SanpoMapIcon.DOG)
        )

        assert result.name == "新名"
        assert result.icon == SanpoMapIcon.DOG

    def _editor_map(self, db_session: Session) -> tuple[SanpoMapService, object, uuid.UUID]:
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        service = make_service(db_session)
        sanpo_map, _ = service._repository.create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.add(SanpoMapMember(sanpo_map_id=sanpo_map.id, user_id=editor.id, role="editor"))
        db_session.commit()
        return service, editor, sanpo_map.id

    @staticmethod
    def _stored(map_id: uuid.UUID) -> tuple[str, str]:
        other_session = TestSessionLocal()
        try:
            stored = other_session.get(SanpoMap, map_id)
            assert stored is not None
            return stored.name, stored.icon
        finally:
            other_session.close()

    def test_editor_sending_icon_raises_permission_denied(self, db_session: Session) -> None:
        service, editor, map_id = self._editor_map(db_session)

        with pytest.raises(SanpoMapPermissionDeniedError):
            service.update_map(editor, map_id, SanpoMapUpdate(icon=SanpoMapIcon.DOG))  # type: ignore[arg-type]

        assert self._stored(map_id) == ("地図", "pin")

    def test_editor_sending_current_icon_still_raises_permission_denied(
        self, db_session: Session
    ) -> None:
        service, editor, map_id = self._editor_map(db_session)

        with pytest.raises(SanpoMapPermissionDeniedError):
            service.update_map(editor, map_id, SanpoMapUpdate(icon=SanpoMapIcon.PIN))  # type: ignore[arg-type]

    def test_editor_sending_name_and_icon_changes_nothing(self, db_session: Session) -> None:
        service, editor, map_id = self._editor_map(db_session)

        with pytest.raises(SanpoMapPermissionDeniedError):
            service.update_map(
                editor,  # type: ignore[arg-type]
                map_id,
                SanpoMapUpdate(name="改名", icon=SanpoMapIcon.DOG),
            )

        assert self._stored(map_id) == ("地図", "pin")

    def test_non_member_sending_icon_raises_not_found(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        service = make_service(db_session)
        sanpo_map, _ = service._repository.create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.commit()

        with pytest.raises(SanpoMapNotFoundError):
            service.update_map(stranger, sanpo_map.id, SanpoMapUpdate(icon=SanpoMapIcon.DOG))


class TestDeleteMap:
    def test_owner_deletes_map_and_member_row(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        created = service.create_map(user, SanpoMapCreate(name="地図"))

        service.delete_map(user, created.id)

        assert db_session.get(SanpoMap, created.id) is None
        assert db_session.get(SanpoMapMember, (created.id, user.id)) is None

    def test_takes_owner_lock_before_locking_map_row(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """PR #103 レビュー対応: owner 単位の advisory lock を `get_membership_for_update()`
        （地図行の `FOR UPDATE`）より前に取ることを固定する（「owner → 地図行」の順で
        `create_map` と揃え、デッドロックを防ぐ, 決定27・28）。
        """
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        created = service.create_map(user, SanpoMapCreate(name="地図"))
        call_order: list[tuple[str, uuid.UUID]] = []
        original_lock_owner = service._repository.lock_owner
        original_get_membership_for_update = service._repository.get_membership_for_update

        def spy_lock_owner(owner_user_id: uuid.UUID) -> None:
            call_order.append(("lock_owner", owner_user_id))
            original_lock_owner(owner_user_id)

        def spy_get_membership_for_update(*, user_id: uuid.UUID, sanpo_map_id: uuid.UUID) -> object:
            call_order.append(("get_membership_for_update", user_id))
            return original_get_membership_for_update(user_id=user_id, sanpo_map_id=sanpo_map_id)

        monkeypatch.setattr(service._repository, "lock_owner", spy_lock_owner)
        monkeypatch.setattr(
            service._repository, "get_membership_for_update", spy_get_membership_for_update
        )

        service.delete_map(user, created.id)

        assert [name for name, _user_id in call_order] == [
            "lock_owner",
            "get_membership_for_update",
        ]
        assert all(user_id == user.id for _name, user_id in call_order)

    def test_cleanup_is_called_after_commit(self, db_session: Session) -> None:
        """後始末（`delete_best_effort`）が呼ばれた時点で、別セッションから地図が見えない
        こと（commit 後に呼ばれることの確認）。
        """
        user = make_user(db_session, subject="u1")
        cleaner = SpyPhotoCleaner()
        service = make_service(db_session, photo_cleaner=cleaner)
        created = service.create_map(user, SanpoMapCreate(name="地図"))
        visible_during_cleanup: list[bool] = []

        def record_visibility(keys: list[str]) -> None:
            other_session = TestSessionLocal()
            try:
                visible_during_cleanup.append(other_session.get(SanpoMap, created.id) is not None)
            finally:
                other_session.close()

        cleaner.on_delete = record_visibility

        service.delete_map(user, created.id)

        assert visible_during_cleanup == [False]

    def test_editor_raises_permission_denied_and_does_not_prepare_deletion(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        cleaner = SpyPhotoCleaner()
        service = make_service(db_session, photo_cleaner=cleaner)
        sanpo_map, _ = service._repository.create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.add(SanpoMapMember(sanpo_map_id=sanpo_map.id, user_id=editor.id, role="editor"))
        db_session.commit()
        list_photo_keys_calls: list[uuid.UUID] = []
        original_list_photo_keys = service._repository.list_photo_keys_for_map

        def spy_list_photo_keys_for_map(sanpo_map_id: uuid.UUID) -> list[tuple[str, str | None]]:
            list_photo_keys_calls.append(sanpo_map_id)
            return original_list_photo_keys(sanpo_map_id)

        monkeypatch.setattr(
            service._repository, "list_photo_keys_for_map", spy_list_photo_keys_for_map
        )

        with pytest.raises(SanpoMapPermissionDeniedError):
            service.delete_map(editor, sanpo_map.id)

        assert list_photo_keys_calls == []
        assert cleaner.calls == []
        assert db_session.get(SanpoMap, sanpo_map.id) is not None

    def test_non_member_raises_not_found(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        cleaner = SpyPhotoCleaner()
        service = make_service(db_session, photo_cleaner=cleaner)
        sanpo_map, _ = service._repository.create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.commit()
        list_photo_keys_calls: list[uuid.UUID] = []
        original_list_photo_keys = service._repository.list_photo_keys_for_map

        def spy_list_photo_keys_for_map(sanpo_map_id: uuid.UUID) -> list[tuple[str, str | None]]:
            list_photo_keys_calls.append(sanpo_map_id)
            return original_list_photo_keys(sanpo_map_id)

        monkeypatch.setattr(
            service._repository, "list_photo_keys_for_map", spy_list_photo_keys_for_map
        )

        with pytest.raises(SanpoMapNotFoundError):
            service.delete_map(stranger, sanpo_map.id)

        assert list_photo_keys_calls == []
        assert cleaner.calls == []

    def test_deleting_default_map_promotes_the_next_one(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        default_map = service.create_map(user, SanpoMapCreate(name="既定"))
        other_map = service.create_map(user, SanpoMapCreate(name="非既定"))

        service.delete_map(user, default_map.id)

        refreshed = db_session.get(SanpoMap, other_map.id)
        assert refreshed is not None
        assert refreshed.is_default is True

    def test_deleting_non_default_map_does_not_change_default(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)
        default_map = service.create_map(user, SanpoMapCreate(name="既定"))
        other_map = service.create_map(user, SanpoMapCreate(name="非既定"))

        service.delete_map(user, other_map.id)

        refreshed = db_session.get(SanpoMap, default_map.id)
        assert refreshed is not None
        assert refreshed.is_default is True

    def test_passes_all_photo_keys_of_the_map_to_the_cleaner(self, db_session: Session) -> None:
        """渡されたキーが地図の全ピンの写真キー（サムネイル含む・`None` 除外）であること。"""
        user = make_user(db_session, subject="u1")
        cleaner = SpyPhotoCleaner()
        service = make_service(db_session, photo_cleaner=cleaner)
        created = service.create_map(user, SanpoMapCreate(name="地図"))
        pin, _ = PinRepository(db_session).create(
            sanpo_map_id=created.id,
            created_by_user_id=user.id,
            client_pin_id=uuid.uuid4(),
            name=None,
            memo=None,
            latitude=0,
            longitude=0,
            client_walk_id=None,
        )
        db_session.commit()
        photo_with_thumbnail = create_pin_photo_row(
            db_session, None, pin_id=pin.id, uploaded_by_user_id=user.id, position=0
        )
        photo_without_thumbnail = create_pin_photo_row(
            db_session,
            None,
            pin_id=pin.id,
            uploaded_by_user_id=user.id,
            position=1,
            with_thumbnail=False,
        )
        # commit 前に控える（R2: 削除後は expire_on_commit により ORM 属性へのアクセスが
        # `ObjectDeletedError` を招くため）。
        expected_keys = {
            photo_with_thumbnail.s3_key,
            photo_with_thumbnail.thumbnail_s3_key,
            photo_without_thumbnail.s3_key,
        }

        service.delete_map(user, created.id)

        assert len(cleaner.calls) == 1
        assert set(cleaner.calls[0]) == expected_keys
        assert None not in cleaner.calls[0]


class TestListTags:
    def test_non_member_raises_not_found_and_does_not_aggregate(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        service = make_service(db_session)
        sanpo_map, _ = service._repository.create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.commit()
        calls: list[dict] = []

        def spy(**kwargs):  # type: ignore[no-untyped-def]
            calls.append(kwargs)
            return []

        monkeypatch.setattr(service._repository, "list_tag_summaries", spy)

        with pytest.raises(SanpoMapNotFoundError):
            service.list_tags(stranger, sanpo_map.id, limit=100)
        assert calls == []

    def test_unknown_map_raises_not_found(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_service(db_session)

        with pytest.raises(SanpoMapNotFoundError):
            service.list_tags(user, uuid.uuid4(), limit=100)

    def test_editor_gets_tags_of_owners_pins(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        service = make_service(db_session)
        sanpo_map, _ = service._repository.create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.add(SanpoMapMember(sanpo_map_id=sanpo_map.id, user_id=editor.id, role="editor"))
        db_session.commit()
        create_pin_with_tags(
            db_session, sanpo_map_id=sanpo_map.id, user_id=owner.id, tags=[("カフェ", 0)]
        )

        result = service.list_tags(editor, sanpo_map.id, limit=100)

        assert [(i.label, i.pin_count) for i in result.items] == [("カフェ", 1)]

    def test_returns_items_in_repository_order_as_label_and_pin_count(
        self, db_session: Session
    ) -> None:
        owner = make_user(db_session, subject="owner")
        service = make_service(db_session)
        sanpo_map, _ = service._repository.create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.commit()
        for _ in range(2):
            create_pin_with_tags(
                db_session, sanpo_map_id=sanpo_map.id, user_id=owner.id, tags=[("多い", 0)]
            )
        create_pin_with_tags(
            db_session, sanpo_map_id=sanpo_map.id, user_id=owner.id, tags=[("少ない", 1)]
        )

        result = service.list_tags(owner, sanpo_map.id, limit=100)

        assert isinstance(result, SanpoMapTagListRead)
        assert result.model_dump() == {
            "items": [{"label": "多い", "pin_count": 2}, {"label": "少ない", "pin_count": 1}]
        }

    def test_passes_limit_to_repository(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        owner = make_user(db_session, subject="owner")
        service = make_service(db_session)
        sanpo_map, _ = service._repository.create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.commit()
        calls: list[dict] = []

        def spy(**kwargs):  # type: ignore[no-untyped-def]
            calls.append(kwargs)
            return []

        monkeypatch.setattr(service._repository, "list_tag_summaries", spy)

        service.list_tags(owner, sanpo_map.id, limit=7)

        assert calls == [{"user_id": owner.id, "sanpo_map_id": sanpo_map.id, "limit": 7}]
