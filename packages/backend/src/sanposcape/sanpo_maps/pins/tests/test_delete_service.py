import logging
import uuid

import pytest
from sqlalchemy.orm import Session

from sanposcape.integrations.aws.s3 import (
    FakeObjectStorage,
    UnconfiguredObjectStorage,
)
from sanposcape.sanpo_maps.conftest import (
    BASE_URL,
    add_map_member,
    create_pin_photo_row,
    make_pin_service,
    make_sanpo_map,
    make_user,
)
from sanposcape.sanpo_maps.exceptions import (
    PinNotFoundError,
    PinPhotoNotFoundError,
    SanpoMapPermissionDeniedError,
)
from sanposcape.sanpo_maps.photos.repository import PinPhotoUploadRepository
from sanposcape.sanpo_maps.pins.schemas import (
    PinCreate,
    PinUpdate,
)


class TestPinServiceDeletePin:
    def test_deletes_pin_and_cascades_photos_and_tags(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        pin_read, _ = service.create_pin(
            owner,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 0, "longitude": 0}),
            base_url=BASE_URL,
        )
        photo = create_pin_photo_row(
            db_session, storage, pin_id=pin_read.id, uploaded_by_user_id=owner.id, position=0
        )
        # commit 後は `photo` の属性が expire される（同じセッションを使っているため）。
        # `delete_pin()` の commit より前に、検証に使うキーを控えておく。
        assert photo.thumbnail_s3_key is not None
        s3_key, thumbnail_s3_key = photo.s3_key, photo.thumbnail_s3_key
        service.update_pin(owner, pin_read.id, PinUpdate(add_tags=["桜"]), base_url=BASE_URL)

        service.delete_pin(owner, pin_read.id)

        with pytest.raises(PinNotFoundError):
            service.get_pin(owner, pin_read.id, base_url=BASE_URL)
        assert storage.head(s3_key) is None
        assert storage.head(thumbnail_s3_key) is None

    def test_resend_after_delete_raises_not_found(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        pin_read, _ = service.create_pin(
            owner,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 0, "longitude": 0}),
            base_url=BASE_URL,
        )
        service.delete_pin(owner, pin_read.id)

        with pytest.raises(PinNotFoundError):
            service.delete_pin(owner, pin_read.id)

    def test_owner_can_delete_others_pin(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        add_map_member(db_session, sanpo_map_id=sanpo_map_id, user_id=editor.id, role="editor")
        pin_read, _ = service.create_pin(
            editor,
            PinCreate(
                client_pin_id=uuid.uuid4(),
                sanpo_map_id=sanpo_map_id,
                location={"latitude": 0, "longitude": 0},
            ),
            base_url=BASE_URL,
        )

        service.delete_pin(owner, pin_read.id)

        with pytest.raises(PinNotFoundError):
            service.get_pin(owner, pin_read.id, base_url=BASE_URL)

    def test_non_creator_editor_cannot_delete(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        editor_a = make_user(db_session, subject="editor-a")
        editor_b = make_user(db_session, subject="editor-b")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        add_map_member(db_session, sanpo_map_id=sanpo_map_id, user_id=editor_a.id, role="editor")
        add_map_member(db_session, sanpo_map_id=sanpo_map_id, user_id=editor_b.id, role="editor")
        pin_read, _ = service.create_pin(
            editor_a,
            PinCreate(
                client_pin_id=uuid.uuid4(),
                sanpo_map_id=sanpo_map_id,
                location={"latitude": 0, "longitude": 0},
            ),
            base_url=BASE_URL,
        )

        with pytest.raises(SanpoMapPermissionDeniedError):
            service.delete_pin(editor_b, pin_read.id)

    def test_non_member_raises_not_found(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        pin_read, _ = service.create_pin(
            owner,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 0, "longitude": 0}),
            base_url=BASE_URL,
        )

        with pytest.raises(PinNotFoundError):
            service.delete_pin(stranger, pin_read.id)

    def test_storage_delete_failure_does_not_prevent_deletion(
        self, db_session: Session, caplog: pytest.LogCaptureFixture
    ) -> None:
        owner = make_user(db_session, subject="owner")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        pin_read, _ = service.create_pin(
            owner,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 0, "longitude": 0}),
            base_url=BASE_URL,
        )
        create_pin_photo_row(
            db_session, storage, pin_id=pin_read.id, uploaded_by_user_id=owner.id, position=0
        )

        def failing_delete_many(keys: list[str]) -> list[str]:
            return list(keys)  # 全キーが削除に失敗したとして返す

        storage.delete_many = failing_delete_many  # type: ignore[method-assign]

        with caplog.at_level(logging.WARNING, logger="sanposcape.sanpo_maps.photos.cleanup"):
            service.delete_pin(owner, pin_read.id)  # 例外を投げない

        with pytest.raises(PinNotFoundError):
            service.get_pin(owner, pin_read.id, base_url=BASE_URL)
        assert any("Failed to delete" in record.getMessage() for record in caplog.records)

    def test_unexpected_storage_exception_does_not_prevent_deletion(
        self, db_session: Session, caplog: pytest.LogCaptureFixture
    ) -> None:
        """R3: `ObjectStorageUnavailableError` 以外の想定外の例外（実装のバグ等）でも、
        DB commit 後の best-effort 境界では 500 にならず、WARNING ログに留める。
        """
        owner = make_user(db_session, subject="owner")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        pin_read, _ = service.create_pin(
            owner,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 0, "longitude": 0}),
            base_url=BASE_URL,
        )
        create_pin_photo_row(
            db_session, storage, pin_id=pin_read.id, uploaded_by_user_id=owner.id, position=0
        )

        def raising_delete_many(keys: list[str]) -> list[str]:
            raise RuntimeError("boom")

        storage.delete_many = raising_delete_many  # type: ignore[method-assign]

        with caplog.at_level(logging.WARNING, logger="sanposcape.sanpo_maps.photos.cleanup"):
            service.delete_pin(owner, pin_read.id)  # 例外を投げない

        with pytest.raises(PinNotFoundError):
            service.get_pin(owner, pin_read.id, base_url=BASE_URL)
        assert any(
            "Failed to delete" in record.getMessage() and "RuntimeError" in record.getMessage()
            for record in caplog.records
        )

    def test_unconfigured_storage_does_not_prevent_deletion(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        creation_storage = FakeObjectStorage(secret="s" * 32)
        creation_service = make_pin_service(db_session, creation_storage)
        pin_read, _ = creation_service.create_pin(
            owner,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 0, "longitude": 0}),
            base_url=BASE_URL,
        )
        create_pin_photo_row(
            db_session,
            creation_storage,
            pin_id=pin_read.id,
            uploaded_by_user_id=owner.id,
            position=0,
        )
        unconfigured_service = make_pin_service(db_session, UnconfiguredObjectStorage())

        unconfigured_service.delete_pin(owner, pin_read.id)

        with pytest.raises(PinNotFoundError):
            unconfigured_service.get_pin(owner, pin_read.id, base_url=BASE_URL)


class TestPinServiceDeletePhoto:
    def test_deletes_photo_and_updates_capacity(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        pin_read, _ = service.create_pin(
            owner,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 0, "longitude": 0}),
            base_url=BASE_URL,
        )
        photo = create_pin_photo_row(
            db_session, storage, pin_id=pin_read.id, uploaded_by_user_id=owner.id, position=0
        )
        # commit 後は `photo` の属性が expire される（同じセッションを使っているため）。
        # `delete_photo()` の commit より前に、検証に使う値を控えておく。
        assert photo.thumbnail_s3_key is not None
        photo_id, byte_size = photo.id, photo.byte_size
        s3_key, thumbnail_s3_key = photo.s3_key, photo.thumbnail_s3_key
        upload_repo = PinPhotoUploadRepository(db_session)
        before_usage = upload_repo.sum_attached_bytes(user_id=owner.id)

        service.delete_photo(owner, pin_read.id, photo_id)

        after_usage = upload_repo.sum_attached_bytes(user_id=owner.id)
        assert after_usage == before_usage - byte_size
        assert storage.head(s3_key) is None
        assert storage.head(thumbnail_s3_key) is None
        result = service.get_pin(owner, pin_read.id, base_url=BASE_URL)
        assert result.photo_count == 0

    def test_deletes_photo_even_when_monotonic_shows_deadline_far_exceeded(
        self, db_session: Session
    ) -> None:
        """写真1枚（キー2つ）の削除は常に1チャンクで終わるため、`monotonic()` がどんな値を
        返しても最初のチャンクとして必ず試みられる（ADR-009 決定22 追補, SS-112）。
        """
        owner = make_user(db_session, subject="owner")
        storage = FakeObjectStorage(secret="s" * 32)
        monotonic_values = iter([0.0, 1_000.0])
        service = make_pin_service(db_session, storage, monotonic=lambda: next(monotonic_values))
        pin_read, _ = service.create_pin(
            owner,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 0, "longitude": 0}),
            base_url=BASE_URL,
        )
        photo = create_pin_photo_row(
            db_session, storage, pin_id=pin_read.id, uploaded_by_user_id=owner.id, position=0
        )
        assert photo.thumbnail_s3_key is not None
        photo_id = photo.id
        s3_key, thumbnail_s3_key = photo.s3_key, photo.thumbnail_s3_key

        service.delete_photo(owner, pin_read.id, photo_id)

        assert storage.head(s3_key) is None
        assert storage.head(thumbnail_s3_key) is None

    def test_resend_after_delete_raises_not_found(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        pin_read, _ = service.create_pin(
            owner,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 0, "longitude": 0}),
            base_url=BASE_URL,
        )
        photo = create_pin_photo_row(
            db_session, storage, pin_id=pin_read.id, uploaded_by_user_id=owner.id, position=0
        )
        service.delete_photo(owner, pin_read.id, photo.id)

        with pytest.raises(PinPhotoNotFoundError):
            service.delete_photo(owner, pin_read.id, photo.id)

    def test_missing_photo_raises_not_found(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        pin_read, _ = service.create_pin(
            owner,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 0, "longitude": 0}),
            base_url=BASE_URL,
        )

        with pytest.raises(PinPhotoNotFoundError):
            service.delete_photo(owner, pin_read.id, uuid.uuid4())

    def test_photo_belonging_to_another_pin_raises_not_found(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        pin_a, _ = service.create_pin(
            owner,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 0, "longitude": 0}),
            base_url=BASE_URL,
        )
        pin_b, _ = service.create_pin(
            owner,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 1, "longitude": 1}),
            base_url=BASE_URL,
        )
        photo = create_pin_photo_row(
            db_session, storage, pin_id=pin_a.id, uploaded_by_user_id=owner.id, position=0
        )

        with pytest.raises(PinPhotoNotFoundError):
            service.delete_photo(owner, pin_b.id, photo.id)

    def test_owner_can_delete_others_photo(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        add_map_member(db_session, sanpo_map_id=sanpo_map_id, user_id=editor.id, role="editor")
        pin_read, _ = service.create_pin(
            owner,
            PinCreate(
                client_pin_id=uuid.uuid4(),
                sanpo_map_id=sanpo_map_id,
                location={"latitude": 0, "longitude": 0},
            ),
            base_url=BASE_URL,
        )
        photo = create_pin_photo_row(
            db_session, storage, pin_id=pin_read.id, uploaded_by_user_id=editor.id, position=0
        )

        service.delete_photo(owner, pin_read.id, photo.id)

        with pytest.raises(PinPhotoNotFoundError):
            service.delete_photo(owner, pin_read.id, photo.id)

    def test_creator_editor_cannot_delete_others_photo(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        add_map_member(db_session, sanpo_map_id=sanpo_map_id, user_id=editor.id, role="editor")
        pin_read, _ = service.create_pin(
            editor,
            PinCreate(
                client_pin_id=uuid.uuid4(),
                sanpo_map_id=sanpo_map_id,
                location={"latitude": 0, "longitude": 0},
            ),
            base_url=BASE_URL,
        )
        photo = create_pin_photo_row(
            db_session, storage, pin_id=pin_read.id, uploaded_by_user_id=owner.id, position=0
        )

        with pytest.raises(SanpoMapPermissionDeniedError):
            service.delete_photo(editor, pin_read.id, photo.id)

    def test_non_member_raises_not_found(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        pin_read, _ = service.create_pin(
            owner,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 0, "longitude": 0}),
            base_url=BASE_URL,
        )
        photo = create_pin_photo_row(
            db_session, storage, pin_id=pin_read.id, uploaded_by_user_id=owner.id, position=0
        )

        with pytest.raises(PinNotFoundError):
            service.delete_photo(stranger, pin_read.id, photo.id)
