import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from sanposcape.integrations.aws.s3 import (
    FakeObjectStorage,
)
from sanposcape.sanpo_maps.conftest import (
    BASE_URL,
    add_map_member,
    make_pin_service,
    make_sanpo_map,
    make_user,
)
from sanposcape.sanpo_maps.exceptions import (
    PinNotFoundError,
    PinTagLimitExceededError,
    SanpoMapPermissionDeniedError,
)
from sanposcape.sanpo_maps.pins.schemas import (
    PinCreate,
    PinUpdate,
)
from sanposcape.sanpo_maps.pins.service import PinService
from sanposcape.users.models import User


class TestPinServiceUpdatePin:
    def _make_pin(
        self,
        service: PinService,
        user: User,
        *,
        sanpo_map_id: uuid.UUID,
        name: str | None = "元の名前",
        memo: str | None = "元のメモ",
    ) -> uuid.UUID:
        pin_read, _ = service.create_pin(
            user,
            PinCreate(
                client_pin_id=uuid.uuid4(),
                sanpo_map_id=sanpo_map_id,
                location={"latitude": 0, "longitude": 0},
                name=name,
                memo=memo,
            ),
            base_url=BASE_URL,
        )
        return pin_read.id

    def test_updates_name_and_memo(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        pin_id = self._make_pin(service, owner, sanpo_map_id=sanpo_map_id)

        result = service.update_pin(
            owner, pin_id, PinUpdate(name="新しい名前", memo="新しいメモ"), base_url=BASE_URL
        )

        assert result.name == "新しい名前"
        assert result.memo == "新しいメモ"

    def test_omitted_fields_are_unchanged(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        pin_id = self._make_pin(service, owner, sanpo_map_id=sanpo_map_id)

        result = service.update_pin(owner, pin_id, PinUpdate(name="新しい名前"), base_url=BASE_URL)

        assert result.name == "新しい名前"
        assert result.memo == "元のメモ"

    def test_null_or_blank_clears_name_and_memo(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        pin_id = self._make_pin(service, owner, sanpo_map_id=sanpo_map_id)

        result = service.update_pin(
            owner, pin_id, PinUpdate(name=None, memo="   "), base_url=BASE_URL
        )

        assert result.name is None
        assert result.memo is None

    def test_empty_body_is_noop(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        pin_id = self._make_pin(service, owner, sanpo_map_id=sanpo_map_id)
        before = service.get_pin(owner, pin_id, base_url=BASE_URL)

        after = service.update_pin(owner, pin_id, PinUpdate(), base_url=BASE_URL)

        assert after.name == before.name
        assert after.memo == before.memo
        assert after.updated_at == before.updated_at

    def test_updated_at_bumps_only_on_real_change(self, db_session: Session) -> None:
        fixed_now = [datetime(2026, 1, 1, tzinfo=UTC)]
        owner = make_user(db_session, subject="owner")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage, now=lambda: fixed_now[0])
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        pin_id = self._make_pin(service, owner, sanpo_map_id=sanpo_map_id)
        created = service.get_pin(owner, pin_id, base_url=BASE_URL)

        fixed_now[0] = datetime(2026, 1, 2, tzinfo=UTC)
        unchanged = service.update_pin(owner, pin_id, PinUpdate(name="元の名前"), base_url=BASE_URL)
        assert unchanged.updated_at == created.updated_at

        fixed_now[0] = datetime(2026, 1, 3, tzinfo=UTC)
        changed = service.update_pin(owner, pin_id, PinUpdate(name="別の名前"), base_url=BASE_URL)
        assert changed.updated_at == datetime(2026, 1, 3, tzinfo=UTC)

    def test_add_tags_normalizes_and_dedupes_against_existing(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        pin_id = self._make_pin(service, owner, sanpo_map_id=sanpo_map_id)
        service.update_pin(owner, pin_id, PinUpdate(add_tags=["桜"]), base_url=BASE_URL)

        result = service.update_pin(
            owner, pin_id, PinUpdate(add_tags=["#桜", "紅葉"]), base_url=BASE_URL
        )

        assert {tag.label for tag in result.tags} == {"桜", "紅葉"}

    def test_remove_tag_ids_ignores_ids_not_belonging_to_this_pin(
        self, db_session: Session
    ) -> None:
        owner = make_user(db_session, subject="owner")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        pin_a = self._make_pin(service, owner, sanpo_map_id=sanpo_map_id)
        pin_b = self._make_pin(service, owner, sanpo_map_id=sanpo_map_id)
        tag_on_b = service.update_pin(
            owner, pin_b, PinUpdate(add_tags=["紅葉"]), base_url=BASE_URL
        ).tags[0]

        result = service.update_pin(
            owner, pin_a, PinUpdate(remove_tag_ids=[tag_on_b.id]), base_url=BASE_URL
        )

        assert result.tags == []
        remaining = service.get_pin(owner, pin_b, base_url=BASE_URL)
        assert {tag.id for tag in remaining.tags} == {tag_on_b.id}

    def test_swap_same_label_reassigns_creator(self, db_session: Session) -> None:
        """同じラベルを削除と追加の両方に含めると、削除してから追加し直す（結果として
        作成者が付け替わる, ADR-009 決定20）。owner は他人（editor）が付けたタグも
        削除できるので、削除役と追加役が別人になる組み合わせで固定する。
        """
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        add_map_member(db_session, sanpo_map_id=sanpo_map_id, user_id=editor.id, role="editor")
        pin_id = self._make_pin(service, owner, sanpo_map_id=sanpo_map_id)
        original_tag = service.update_pin(
            editor, pin_id, PinUpdate(add_tags=["桜"]), base_url=BASE_URL
        ).tags[0]
        assert original_tag.created_by_user_id == editor.id

        result = service.update_pin(
            owner,
            pin_id,
            PinUpdate(remove_tag_ids=[original_tag.id], add_tags=["桜"]),
            base_url=BASE_URL,
        )

        assert len(result.tags) == 1
        assert result.tags[0].id != original_tag.id
        assert result.tags[0].created_by_user_id == owner.id

    def test_tag_limit_exceeded_rolls_back(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        pin_id = self._make_pin(service, owner, sanpo_map_id=sanpo_map_id)
        service.update_pin(
            owner, pin_id, PinUpdate(add_tags=[f"tag{i}" for i in range(10)]), base_url=BASE_URL
        )

        with pytest.raises(PinTagLimitExceededError):
            service.update_pin(owner, pin_id, PinUpdate(add_tags=["overflow"]), base_url=BASE_URL)

        # commit していないので、request のライフサイクル終了時の `get_db()` の
        # `finally: db.close()` がロールバックする（router 経由のテストで確認済み）。
        # サービスを直接呼ぶ単体テストではそれをここで明示的に行う
        # （`TestPinServiceObjectStorageFailure` と同じ流儀）。
        db_session.rollback()

        result = service.get_pin(owner, pin_id, base_url=BASE_URL)
        assert len(result.tags) == 10

    def test_non_creator_editor_cannot_update_name(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        editor_a = make_user(db_session, subject="editor-a")
        editor_b = make_user(db_session, subject="editor-b")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        add_map_member(db_session, sanpo_map_id=sanpo_map_id, user_id=editor_a.id, role="editor")
        add_map_member(db_session, sanpo_map_id=sanpo_map_id, user_id=editor_b.id, role="editor")
        pin_id = self._make_pin(service, editor_a, sanpo_map_id=sanpo_map_id)

        with pytest.raises(SanpoMapPermissionDeniedError):
            service.update_pin(editor_b, pin_id, PinUpdate(name="乗っ取り"), base_url=BASE_URL)

        unchanged = service.get_pin(owner, pin_id, base_url=BASE_URL)
        assert unchanged.name == "元の名前"

    def test_non_creator_editor_can_add_tags(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        editor_a = make_user(db_session, subject="editor-a")
        editor_b = make_user(db_session, subject="editor-b")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        add_map_member(db_session, sanpo_map_id=sanpo_map_id, user_id=editor_a.id, role="editor")
        add_map_member(db_session, sanpo_map_id=sanpo_map_id, user_id=editor_b.id, role="editor")
        pin_id = self._make_pin(service, editor_a, sanpo_map_id=sanpo_map_id)

        result = service.update_pin(editor_b, pin_id, PinUpdate(add_tags=["桜"]), base_url=BASE_URL)

        assert {tag.label for tag in result.tags} == {"桜"}

    def test_non_creator_editor_cannot_remove_others_tag(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        editor_a = make_user(db_session, subject="editor-a")
        editor_b = make_user(db_session, subject="editor-b")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        add_map_member(db_session, sanpo_map_id=sanpo_map_id, user_id=editor_a.id, role="editor")
        add_map_member(db_session, sanpo_map_id=sanpo_map_id, user_id=editor_b.id, role="editor")
        pin_id = self._make_pin(service, editor_a, sanpo_map_id=sanpo_map_id)
        tag = service.update_pin(
            editor_a, pin_id, PinUpdate(add_tags=["桜"]), base_url=BASE_URL
        ).tags[0]

        with pytest.raises(SanpoMapPermissionDeniedError):
            service.update_pin(
                editor_b, pin_id, PinUpdate(remove_tag_ids=[tag.id]), base_url=BASE_URL
            )

    def test_partial_permission_failure_does_not_apply_any_change(
        self, db_session: Session
    ) -> None:
        """`name` の権限が無ければ、同時に送った `add_tags` も反映されない（原子性）。"""
        owner = make_user(db_session, subject="owner")
        editor_a = make_user(db_session, subject="editor-a")
        editor_b = make_user(db_session, subject="editor-b")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        add_map_member(db_session, sanpo_map_id=sanpo_map_id, user_id=editor_a.id, role="editor")
        add_map_member(db_session, sanpo_map_id=sanpo_map_id, user_id=editor_b.id, role="editor")
        pin_id = self._make_pin(service, editor_a, sanpo_map_id=sanpo_map_id)

        with pytest.raises(SanpoMapPermissionDeniedError):
            service.update_pin(
                editor_b, pin_id, PinUpdate(name="乗っ取り", add_tags=["桜"]), base_url=BASE_URL
            )

        result = service.get_pin(owner, pin_id, base_url=BASE_URL)
        assert result.tags == []
        assert result.name == "元の名前"

    def test_non_member_pin_raises_not_found(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        pin_id = self._make_pin(service, owner, sanpo_map_id=sanpo_map_id)

        with pytest.raises(PinNotFoundError):
            service.update_pin(stranger, pin_id, PinUpdate(name="X"), base_url=BASE_URL)
