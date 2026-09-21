import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from sanposcape.integrations.aws.s3 import FakeObjectStorage
from sanposcape.pins.exceptions import (
    PinNotFoundError,
    PinPhotoTooLargeError,
    PinPhotoUploadNotReadyError,
    StorageQuotaExceededError,
    TooManyPendingUploadsError,
)
from sanposcape.pins.photo_attacher import PhotoAttacher
from sanposcape.pins.repository import PinPhotoUploadRepository, PinRepository
from sanposcape.pins.schemas import PinCreate, PinPhotosAdd, PinPhotoUploadCreate
from sanposcape.pins.service import PinPhotoUploadService, PinService
from sanposcape.pins.tests.conftest import create_upload_row, make_user, seed_staging_photo
from sanposcape.sanpo_maps.exceptions import SanpoMapNotFoundError
from sanposcape.sanpo_maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.service import SanpoMapService

BASE_URL = "http://testserver/"


def make_upload_service(
    db_session: Session, storage: FakeObjectStorage, **overrides
) -> PinPhotoUploadService:
    kwargs = {
        "max_byte_size": 10 * 1024 * 1024,
        "user_quota_bytes": 1024**3,
        "max_pending_uploads": 30,
        "upload_url_ttl_seconds": 600,
        "attach_ttl_seconds": 21_600,
    }
    kwargs.update(overrides)
    return PinPhotoUploadService(
        db_session, PinPhotoUploadRepository(db_session), storage, **kwargs
    )


def make_pin_service(db_session: Session, storage: FakeObjectStorage, **overrides) -> PinService:
    kwargs = {
        "user_quota_bytes": 1024**3,
        "confirm_deadline_seconds": 20,
        "read_photos_limit": 10,
        "download_url_ttl_seconds": 3600,
    }
    kwargs.update(overrides)
    photo_attacher = PhotoAttacher(
        storage,
        max_bytes=10 * 1024 * 1024,
        max_pixels=1_000_000,
        thumbnail_max_edge=512,
        thumbnail_quality=80,
        concurrency=3,
    )
    return PinService(
        db_session,
        PinRepository(db_session),
        PinPhotoUploadRepository(db_session),
        SanpoMapService(db_session, SanpoMapRepository(db_session)),
        photo_attacher,
        storage,
        **kwargs,
    )


class TestPinPhotoUploadServiceCreateUpload:
    def test_creates_upload_and_returns_presigned_form(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_upload_service(db_session, storage)

        result = service.create_upload(
            user, PinPhotoUploadCreate(content_type="image/jpeg", byte_size=1000), base_url=BASE_URL
        )

        assert result.max_byte_size == 10 * 1024 * 1024
        assert result.upload.fields["key"].startswith(f"staging/pins/{user.id}/")

    def test_too_large_raises(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_upload_service(db_session, storage, max_byte_size=100)

        with pytest.raises(PinPhotoTooLargeError):
            service.create_upload(
                user,
                PinPhotoUploadCreate(content_type="image/jpeg", byte_size=200),
                base_url=BASE_URL,
            )

    def test_pending_limit_raises(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        create_upload_row(db_session, user_id=user.id)
        service = make_upload_service(db_session, storage, max_pending_uploads=1)

        with pytest.raises(TooManyPendingUploadsError):
            service.create_upload(
                user,
                PinPhotoUploadCreate(content_type="image/jpeg", byte_size=100),
                base_url=BASE_URL,
            )

    def test_quota_exceeded_raises(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_upload_service(db_session, storage, user_quota_bytes=100)

        with pytest.raises(StorageQuotaExceededError):
            service.create_upload(
                user,
                PinPhotoUploadCreate(content_type="image/jpeg", byte_size=200),
                base_url=BASE_URL,
            )

    def test_quota_exactly_at_limit_succeeds(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_upload_service(db_session, storage, user_quota_bytes=100)

        result = service.create_upload(
            user, PinPhotoUploadCreate(content_type="image/jpeg", byte_size=100), base_url=BASE_URL
        )
        assert result.upload_id is not None


class TestPinServiceCreatePin:
    def test_creates_pin_without_photos_in_default_map(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        payload = PinCreate(
            client_pin_id=uuid.uuid4(),
            location={"latitude": 35.0, "longitude": 139.0},
        )

        pin_read, created = service.create_pin(user, payload, base_url=BASE_URL)

        assert created is True
        assert pin_read.sanpo_map.name == "最初の地図"
        assert pin_read.sanpo_map.is_default is True
        assert pin_read.photos == []
        assert pin_read.photo_count == 0

    def test_idempotent_resend_returns_existing_without_reprocessing(
        self, db_session: Session
    ) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        client_pin_id = uuid.uuid4()
        first, _ = service.create_pin(
            user,
            PinCreate(
                client_pin_id=client_pin_id, location={"latitude": 1, "longitude": 1}, name="A"
            ),
            base_url=BASE_URL,
        )

        second, created = service.create_pin(
            user,
            PinCreate(
                client_pin_id=client_pin_id, location={"latitude": 2, "longitude": 2}, name="B"
            ),
            base_url=BASE_URL,
        )

        assert created is False
        assert second.id == first.id
        assert second.name == "A"

    def test_explicit_sanpo_map_not_member_raises_not_found(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        storage = FakeObjectStorage(secret="s" * 32)
        sanpo_map, _ = SanpoMapRepository(db_session).create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.commit()
        service = make_pin_service(db_session, storage)

        with pytest.raises(SanpoMapNotFoundError):
            service.create_pin(
                stranger,
                PinCreate(
                    client_pin_id=uuid.uuid4(),
                    sanpo_map_id=sanpo_map.id,
                    location={"latitude": 0, "longitude": 0},
                ),
                base_url=BASE_URL,
            )

    def test_creates_pin_with_photo_and_thumbnail(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        upload_id = uuid.uuid4()
        seed_staging_photo(storage, user_id=user.id, upload_id=upload_id)
        create_upload_row(db_session, user_id=user.id, upload_id=upload_id)
        service = make_pin_service(db_session, storage)

        pin_read, created = service.create_pin(
            user,
            PinCreate(
                client_pin_id=uuid.uuid4(),
                location={"latitude": 0, "longitude": 0},
                photo_upload_ids=[upload_id],
            ),
            base_url=BASE_URL,
        )

        assert created is True
        assert pin_read.photo_count == 1
        assert pin_read.photos[0].thumbnail is not None
        assert pin_read.photos[0].width == 100
        assert pin_read.photos[0].height == 100

        # 確定後は upload の status が attached になっている。
        uploads = PinPhotoUploadRepository(db_session).lock_for_attach(
            user_id=user.id, upload_ids=[upload_id]
        )
        assert uploads[0].status == "attached"
        # staging は best-effort で削除される。
        assert storage.head(f"staging/pins/{user.id}/{upload_id}.jpg") is None

    def test_invalid_photo_upload_raises_not_ready_and_creates_nothing(
        self, db_session: Session
    ) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        client_pin_id = uuid.uuid4()

        with pytest.raises(PinPhotoUploadNotReadyError):
            service.create_pin(
                user,
                PinCreate(
                    client_pin_id=client_pin_id,
                    location={"latitude": 0, "longitude": 0},
                    photo_upload_ids=[uuid.uuid4()],  # 存在しない枠
                ),
                base_url=BASE_URL,
            )

        assert (
            PinRepository(db_session).get_by_client_pin_id(
                user_id=user.id, client_pin_id=client_pin_id
            )
            is None
        )

    def test_other_users_upload_raises_not_ready(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        storage = FakeObjectStorage(secret="s" * 32)
        upload = create_upload_row(db_session, user_id=owner.id)
        service = make_pin_service(db_session, storage)

        with pytest.raises(PinPhotoUploadNotReadyError):
            service.create_pin(
                stranger,
                PinCreate(
                    client_pin_id=uuid.uuid4(),
                    location={"latitude": 0, "longitude": 0},
                    photo_upload_ids=[upload.id],
                ),
                base_url=BASE_URL,
            )

    def test_expired_upload_raises_not_ready(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        from datetime import timedelta

        upload = create_upload_row(
            db_session, user_id=user.id, expires_at=datetime.now(UTC) - timedelta(seconds=1)
        )
        service = make_pin_service(db_session, storage)

        with pytest.raises(PinPhotoUploadNotReadyError):
            service.create_pin(
                user,
                PinCreate(
                    client_pin_id=uuid.uuid4(),
                    location={"latitude": 0, "longitude": 0},
                    photo_upload_ids=[upload.id],
                ),
                base_url=BASE_URL,
            )

    def test_real_size_over_quota_raises_storage_quota_exceeded(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        upload_id = uuid.uuid4()
        data = seed_staging_photo(storage, user_id=user.id, upload_id=upload_id, size=(100, 100))
        # 申告値は小さいが実サイズ (len(data)) は容量を超える設定にする。
        create_upload_row(db_session, user_id=user.id, upload_id=upload_id, declared_byte_size=1)
        service = make_pin_service(db_session, storage, user_quota_bytes=len(data) - 1)

        with pytest.raises(StorageQuotaExceededError):
            service.create_pin(
                user,
                PinCreate(
                    client_pin_id=uuid.uuid4(),
                    location={"latitude": 0, "longitude": 0},
                    photo_upload_ids=[upload_id],
                ),
                base_url=BASE_URL,
            )


class TestPinServiceAddPhotos:
    def _create_pin(self, db_session: Session, storage: FakeObjectStorage, user) -> uuid.UUID:
        service = make_pin_service(db_session, storage)
        pin_read, _ = service.create_pin(
            user,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 0, "longitude": 0}),
            base_url=BASE_URL,
        )
        return pin_read.id

    def test_adds_photo_with_incrementing_position(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        pin_id = self._create_pin(db_session, storage, user)
        upload_id = uuid.uuid4()
        seed_staging_photo(storage, user_id=user.id, upload_id=upload_id)
        create_upload_row(db_session, user_id=user.id, upload_id=upload_id)
        service = make_pin_service(db_session, storage)

        result = service.add_photos(
            user, pin_id, PinPhotosAdd(photo_upload_ids=[upload_id]), base_url=BASE_URL
        )

        assert result.photo_count == 1
        assert result.items[0].position == 0

    def test_resend_of_already_attached_upload_succeeds(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        pin_id = self._create_pin(db_session, storage, user)
        upload_id = uuid.uuid4()
        seed_staging_photo(storage, user_id=user.id, upload_id=upload_id)
        create_upload_row(db_session, user_id=user.id, upload_id=upload_id)
        service = make_pin_service(db_session, storage)
        service.add_photos(
            user, pin_id, PinPhotosAdd(photo_upload_ids=[upload_id]), base_url=BASE_URL
        )

        result = service.add_photos(
            user, pin_id, PinPhotosAdd(photo_upload_ids=[upload_id]), base_url=BASE_URL
        )

        assert result.photo_count == 1

    def test_upload_attached_to_different_pin_raises_not_ready(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        pin_id_a = self._create_pin(db_session, storage, user)
        pin_id_b = self._create_pin(db_session, storage, user)
        upload_id = uuid.uuid4()
        seed_staging_photo(storage, user_id=user.id, upload_id=upload_id)
        create_upload_row(db_session, user_id=user.id, upload_id=upload_id)
        service = make_pin_service(db_session, storage)
        service.add_photos(
            user, pin_id_a, PinPhotosAdd(photo_upload_ids=[upload_id]), base_url=BASE_URL
        )

        with pytest.raises(PinPhotoUploadNotReadyError):
            service.add_photos(
                user, pin_id_b, PinPhotosAdd(photo_upload_ids=[upload_id]), base_url=BASE_URL
            )

    def test_non_member_pin_raises_not_found(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        storage = FakeObjectStorage(secret="s" * 32)
        pin_id = self._create_pin(db_session, storage, owner)
        service = make_pin_service(db_session, storage)

        with pytest.raises(PinNotFoundError):
            service.add_photos(
                stranger, pin_id, PinPhotosAdd(photo_upload_ids=[uuid.uuid4()]), base_url=BASE_URL
            )

    def test_missing_pin_raises_not_found(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)

        with pytest.raises(PinNotFoundError):
            service.add_photos(
                user, uuid.uuid4(), PinPhotosAdd(photo_upload_ids=[uuid.uuid4()]), base_url=BASE_URL
            )

    def test_response_photos_are_ordered_by_requested_upload_ids(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        pin_id = self._create_pin(db_session, storage, user)
        upload_ids = [uuid.uuid4() for _ in range(3)]
        for upload_id in upload_ids:
            seed_staging_photo(storage, user_id=user.id, upload_id=upload_id)
            create_upload_row(db_session, user_id=user.id, upload_id=upload_id)
        service = make_pin_service(db_session, storage)

        # 逆順に指定しても、応答はリクエストした順で返る。
        requested = list(reversed(upload_ids))
        result = service.add_photos(
            user, pin_id, PinPhotosAdd(photo_upload_ids=requested), base_url=BASE_URL
        )

        assert [item.upload_id for item in result.items] == requested
        assert result.photo_count == 3
