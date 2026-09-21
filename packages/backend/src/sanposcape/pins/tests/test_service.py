import threading
import time
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from sanposcape.conftest import TestSessionLocal
from sanposcape.integrations.aws.s3 import FakeObjectStorage, ObjectStorageUnavailableError
from sanposcape.pins.exceptions import (
    PinNotFoundError,
    PinPhotoTooLargeError,
    PinPhotoUploadNotReadyError,
    StorageQuotaExceededError,
    TooManyPendingUploadsError,
)
from sanposcape.pins.photo_attacher import PhotoAttacher, PreparedPhoto
from sanposcape.pins.repository import PinPhotoUploadRepository, PinRepository
from sanposcape.pins.schemas import PinCreate, PinPhotosAdd, PinPhotoUploadCreate
from sanposcape.pins.service import PinPhotoUploadService, PinService
from sanposcape.pins.tests.conftest import create_upload_row, make_user, seed_staging_photo
from sanposcape.sanpo_maps.exceptions import SanpoMapNotFoundError
from sanposcape.sanpo_maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.service import SanpoMapService
from sanposcape.users.models import User

BASE_URL = "http://testserver/"
_LOCK_WAIT_TIMEOUT = 5.0


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


def _make_prepared_photo(*, user_id: uuid.UUID, upload_id: uuid.UUID) -> PreparedPhoto:
    """DB書き込みだけを検証するテスト用のフェイク（S3への実書き込みは行わない）。"""
    return PreparedPhoto(
        upload_id=upload_id,
        staging_key=f"staging/pins/{user_id}/{upload_id}.jpg",
        original_key=f"original/pins/{user_id}/{upload_id}.jpg",
        thumbnail_key=f"thumb/pins/{user_id}/{upload_id}/512.jpg",
        content_type="image/jpeg",
        byte_size=100,
        width=10,
        height=10,
        thumbnail_bytes=b"x",
        thumbnail_byte_size=1,
        thumbnail_width=5,
        thumbnail_height=5,
    )


class TestCreatePinTrueConcurrentIdempotentResend:
    """R1 の回帰テスト（Critical）。

    `backend-plan.md` 5.5 手順3 / ADR-003 決定3 が要求する「アップロード枠が真に同時な
    再送で `attached` 済みでも、紐付け先が同じ `client_pin_id` のピンなら成功として
    既存ピンを返す」契約を検証する。`threading.Thread` + 別 `Session`（= 別コネクション）
    で実DB（PostgreSQL）上の真の競合を再現する
    （`walks/tests/test_repository.py::TestDeleteConcurrentRace` と同じ手法）。

    holder は「1回目のリクエストが確定処理を終えて commit する直前」を、実際の
    `PhotoAttacher`（S3 I/O）を経由せず repository 呼び出しで直接模する。これにより
    `PinPhotoUploadRepository.lock_for_attach()`（`FOR UPDATE`）の行ロックを、waiter の
    `PinService.create_pin()` が本物のロック待ちとして経験することだけを検証対象にする。
    """

    def test_second_request_returns_existing_pin_instead_of_409(self, db_session: Session) -> None:
        user = make_user(db_session, subject="race-user")
        storage = FakeObjectStorage(secret="s" * 32)
        upload_id = uuid.uuid4()
        seed_staging_photo(storage, user_id=user.id, upload_id=upload_id)
        create_upload_row(db_session, user_id=user.id, upload_id=upload_id)
        sanpo_map, _ = SanpoMapRepository(db_session).create_with_owner(
            owner_user_id=user.id, name="最初の地図", is_default=True
        )
        db_session.commit()
        client_pin_id = uuid.uuid4()
        user_id = user.id
        sanpo_map_id = sanpo_map.id

        holder_locked = threading.Event()
        holder_may_commit = threading.Event()
        results: dict[str, object] = {}
        errors: list[BaseException] = []

        def _holder() -> None:
            session = TestSessionLocal()
            try:
                upload_repo = PinPhotoUploadRepository(session)
                pin_repo = PinRepository(session)
                # 実際の1回目のリクエストが `_prepare_photos` の `lock_for_attach` で
                # 行ロックを取得した状態を再現する（未コミット。行ロックを保持したまま待機）。
                upload_repo.lock_for_attach(user_id=user_id, upload_ids=[upload_id])
                holder_locked.set()
                holder_may_commit.wait(timeout=_LOCK_WAIT_TIMEOUT)
                # 検証・サムネイル生成・Copy を終えて DB 書き込み・commit する直前の状態を
                # 模す（S3 側の中身はこのテストの検証対象ではないため実際には書き込まない）。
                pin, created = pin_repo.create(
                    sanpo_map_id=sanpo_map_id,
                    created_by_user_id=user_id,
                    client_pin_id=client_pin_id,
                    name="A",
                    memo=None,
                    latitude=0,
                    longitude=0,
                    client_walk_id=None,
                )
                if not created:
                    raise AssertionError("holder should be the first to create the pin")
                pin_repo.add_photos(
                    pin_id=pin.id,
                    uploaded_by_user_id=user_id,
                    prepared=[_make_prepared_photo(user_id=user_id, upload_id=upload_id)],
                    start_position=0,
                )
                upload_repo.mark_attached(upload_ids=[upload_id], attached_at=datetime.now(UTC))
                session.commit()
                results["holder_pin_id"] = pin.id
            except BaseException as exc:  # noqa: BLE001 - スレッド内例外をテスト本体に伝える
                errors.append(exc)
                holder_locked.set()
            finally:
                session.close()

        def _waiter() -> None:
            session = TestSessionLocal()
            try:
                waiter_user = session.get(User, user_id)
                if waiter_user is None:
                    raise AssertionError("user not found in waiter session")
                service = make_pin_service(session, storage)
                pin_read, created = service.create_pin(
                    waiter_user,
                    PinCreate(
                        client_pin_id=client_pin_id,
                        sanpo_map_id=sanpo_map_id,
                        location={"latitude": 0, "longitude": 0},
                        photo_upload_ids=[upload_id],
                    ),
                    base_url=BASE_URL,
                )
                results["waiter_created"] = created
                results["waiter_pin_id"] = pin_read.id
            except BaseException as exc:  # noqa: BLE001
                errors.append(exc)
            finally:
                session.close()

        holder_thread = threading.Thread(target=_holder)
        waiter_thread = threading.Thread(target=_waiter)

        holder_thread.start()
        assert holder_locked.wait(timeout=_LOCK_WAIT_TIMEOUT), "holder が行ロックを取得できなかった"
        waiter_thread.start()

        # waiter が holder の行ロックで実際にブロックされていることを確認する
        # （早期完了は行ロックによる競合再現に失敗している証拠）。
        time.sleep(0.3)
        assert "waiter_created" not in results, (
            "waiter が holder の commit 前に完了した(競合の再現に失敗)"
        )

        holder_may_commit.set()
        holder_thread.join(timeout=_LOCK_WAIT_TIMEOUT)
        waiter_thread.join(timeout=_LOCK_WAIT_TIMEOUT)

        assert not holder_thread.is_alive(), "holder スレッドがタイムアウトした"
        assert not waiter_thread.is_alive(), "waiter スレッドがタイムアウトした"
        assert not errors, f"スレッド内で例外が発生した: {errors}"
        assert results["waiter_created"] is False  # 409 ではなく 200 相当（既存ピンを返す）
        assert results["waiter_pin_id"] == results["holder_pin_id"]


class TestAddPhotosConcurrentIdempotentResendFallback:
    """R1 の回帰テスト（add_photos 側）。

    architecture レビューの指摘どおり、`add_photos()` も `_prepare_photos()` が
    `PinPhotoUploadNotReadyError` を送出した場合に `find_attachments()` で
    「対象ピンに実際に紐付いたか」を再確認し、紐付いていれば成功応答に倒す
    （事前チェックをすり抜けてロック待ちに入った場合の安全網）。
    """

    def test_falls_back_to_success_when_already_attached_to_target_pin_after_lock_wait(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        pin_read, _ = service.create_pin(
            user,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 0, "longitude": 0}),
            base_url=BASE_URL,
        )
        pin_id = pin_read.id
        upload_id = uuid.uuid4()
        create_upload_row(db_session, user_id=user.id, upload_id=upload_id)

        # 事前チェック（`list_photos`/`find_attachments`）はまだ「未紐付け」を見る
        # スナップショットのまま、`_prepare_photos` 内部の `lock_for_attach` だけが
        # 「ロック待ちの末に見つけたら既に対象ピンへ attached 済みだった」状態を
        # 再現する: `PinPhotoUploadRepository.lock_for_attach` を差し替え、呼ばれた
        # 時点で（真に同時なリクエストが commit した後を模して）直接 attach してしまう。
        real_lock_for_attach = PinPhotoUploadRepository.lock_for_attach

        def fake_lock_for_attach(self, *, user_id, upload_ids):  # noqa: ANN001
            uploads = real_lock_for_attach(self, user_id=user_id, upload_ids=upload_ids)
            PinRepository(db_session).add_photos(
                pin_id=pin_id,
                uploaded_by_user_id=user_id,
                prepared=[_make_prepared_photo(user_id=user_id, upload_id=upload_id)],
                start_position=0,
            )
            self.mark_attached(upload_ids=upload_ids, attached_at=datetime.now(UTC))
            # `mark_attached` は Core の `update()` なので、既に読み込み済みの ORM
            # オブジェクト（`uploads`）には自動反映されない。呼び出し元（`_prepare_photos`）
            # が「ロック取得後に読み直したら attached だった」を観測できるよう明示的に
            # refresh する（同一トランザクション内なので commit 前でも読める）。
            for upload in uploads:
                db_session.refresh(upload)
            return uploads

        monkeypatch.setattr(PinPhotoUploadRepository, "lock_for_attach", fake_lock_for_attach)

        result = service.add_photos(
            user, pin_id, PinPhotosAdd(photo_upload_ids=[upload_id]), base_url=BASE_URL
        )

        assert result.photo_count == 1
        assert result.items[0].upload_id == upload_id


class TestPinServiceObjectStorageFailure:
    """R2/R3 の回帰テスト。

    確定処理（`commit()`）が `ObjectStorageUnavailableError` を送出した場合、
    `PinService.create_pin` はそれをそのまま伝播させ（router で503に変換される）、
    DBはロールバックされて中間状態（写真の欠けたピン）を残さないことを確認する。
    """

    def test_create_pin_propagates_storage_failure_and_rolls_back(
        self, db_session: Session
    ) -> None:
        class FailingPutStorage(FakeObjectStorage):
            """`commit()` フェーズ（サムネイル Put）だけを失敗させる。`seed_staging_photo()`
            が使う staging への Put は成功させ、確定処理の Copy 前に失敗させる。
            """

            def put_bytes(self, key: str, data: bytes, *, content_type: str) -> None:
                if key.startswith("thumb/"):
                    raise ObjectStorageUnavailableError("boom")
                super().put_bytes(key, data, content_type=content_type)

        user = make_user(db_session, subject="u1")
        storage = FailingPutStorage(secret="s" * 32)
        upload_id = uuid.uuid4()
        seed_staging_photo(storage, user_id=user.id, upload_id=upload_id)
        create_upload_row(db_session, user_id=user.id, upload_id=upload_id)
        service = make_pin_service(db_session, storage)
        client_pin_id = uuid.uuid4()

        with pytest.raises(ObjectStorageUnavailableError):
            service.create_pin(
                user,
                PinCreate(
                    client_pin_id=client_pin_id,
                    location={"latitude": 0, "longitude": 0},
                    photo_upload_ids=[upload_id],
                ),
                base_url=BASE_URL,
            )

        db_session.rollback()
        assert (
            PinRepository(db_session).get_by_client_pin_id(
                user_id=user.id, client_pin_id=client_pin_id
            )
            is None
        )
