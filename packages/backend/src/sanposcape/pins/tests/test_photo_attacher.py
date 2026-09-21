import uuid

import pytest

from sanposcape.integrations.aws.s3 import FakeObjectStorage, ObjectStorageUnavailableError
from sanposcape.pins.photo_attacher import InvalidPhotoError, PhotoAttacher, PhotoUploadInput
from sanposcape.pins.photo_keys import original_key, staging_key, thumbnail_key
from sanposcape.pins.tests.conftest import make_jpeg_bytes

USER_ID = uuid.uuid4()


def make_attacher(storage: FakeObjectStorage, **overrides) -> PhotoAttacher:
    kwargs = {
        "max_bytes": 10 * 1024 * 1024,
        "max_pixels": 1_000_000,
        "thumbnail_max_edge": 50,
        "thumbnail_quality": 80,
        "concurrency": 3,
    }
    kwargs.update(overrides)
    return PhotoAttacher(storage, **kwargs)


def seed(storage: FakeObjectStorage, upload_id: uuid.UUID, *, size=(100, 100)) -> None:
    storage.put_bytes(
        staging_key(user_id=USER_ID, upload_id=upload_id),
        make_jpeg_bytes(size),
        content_type="image/jpeg",
    )


class TestPrepare:
    def test_prepares_all_photos_in_parallel(self) -> None:
        storage = FakeObjectStorage(secret="s" * 32)
        upload_ids = [uuid.uuid4() for _ in range(5)]
        for upload_id in upload_ids:
            seed(storage, upload_id)
        attacher = make_attacher(storage)
        inputs = [
            PhotoUploadInput(
                upload_id=upload_id, staging_key=staging_key(user_id=USER_ID, upload_id=upload_id)
            )
            for upload_id in upload_ids
        ]

        prepared = attacher.prepare(inputs, user_id=USER_ID, deadline_seconds=20)

        assert [item.upload_id for item in prepared] == upload_ids
        for item in prepared:
            assert item.width == 100
            assert item.height == 100
            assert item.thumbnail_width == 50
            assert item.thumbnail_height == 50
            assert item.original_key == original_key(user_id=USER_ID, upload_id=item.upload_id)
            assert item.thumbnail_key == thumbnail_key(
                user_id=USER_ID, upload_id=item.upload_id, size=50
            )

    def test_missing_object_raises_invalid_photo_error_and_writes_nothing(self) -> None:
        storage = FakeObjectStorage(secret="s" * 32)
        upload_id = uuid.uuid4()  # 未アップロードのまま（staging に実体が無い）
        attacher = make_attacher(storage)
        inputs = [
            PhotoUploadInput(
                upload_id=upload_id, staging_key=staging_key(user_id=USER_ID, upload_id=upload_id)
            )
        ]

        with pytest.raises(InvalidPhotoError):
            attacher.prepare(inputs, user_id=USER_ID, deadline_seconds=20)

        assert storage.head(original_key(user_id=USER_ID, upload_id=upload_id)) is None

    def test_non_jpeg_raises_invalid_photo_error(self) -> None:
        storage = FakeObjectStorage(secret="s" * 32)
        upload_id = uuid.uuid4()
        storage.put_bytes(
            staging_key(user_id=USER_ID, upload_id=upload_id),
            b"not an image",
            content_type="image/jpeg",
        )
        attacher = make_attacher(storage)
        inputs = [
            PhotoUploadInput(
                upload_id=upload_id, staging_key=staging_key(user_id=USER_ID, upload_id=upload_id)
            )
        ]

        with pytest.raises(InvalidPhotoError):
            attacher.prepare(inputs, user_id=USER_ID, deadline_seconds=20)

    def test_deadline_exceeded_raises_object_storage_unavailable(self) -> None:
        storage = FakeObjectStorage(secret="s" * 32)
        upload_id = uuid.uuid4()
        seed(storage, upload_id)
        # monotonic を常に「期限を過ぎた」値にして、開始前チェックで即座に打ち切らせる。
        attacher = PhotoAttacher(
            storage,
            max_bytes=10 * 1024 * 1024,
            max_pixels=1_000_000,
            thumbnail_max_edge=50,
            thumbnail_quality=80,
            concurrency=1,
            monotonic=lambda: 1_000_000.0,
        )
        inputs = [
            PhotoUploadInput(
                upload_id=upload_id, staging_key=staging_key(user_id=USER_ID, upload_id=upload_id)
            )
        ]

        with pytest.raises(ObjectStorageUnavailableError):
            # deadline_seconds に負数を渡し、開始時点で既に期限切れの状態を作る。
            attacher.prepare(inputs, user_id=USER_ID, deadline_seconds=-1)

    def test_storage_unavailable_takes_priority_over_invalid_photo(self) -> None:
        """503（再送で回復しうる）を409より優先して報告する。"""

        class FlakyStorage:
            def __init__(self, ok_upload_id: uuid.UUID) -> None:
                self._ok_upload_id = ok_upload_id
                self._inner = FakeObjectStorage(secret="s" * 32)
                seed(self._inner, ok_upload_id)

            def get_bytes(self, key: str, *, max_bytes: int) -> bytes:
                if self._ok_upload_id.hex not in key:
                    raise ObjectStorageUnavailableError("boom")
                return self._inner.get_bytes(key, max_bytes=max_bytes)

        ok_id = uuid.uuid4()
        bad_id = uuid.uuid4()
        storage = FlakyStorage(ok_id)
        attacher = make_attacher(storage)
        inputs = [
            PhotoUploadInput(
                upload_id=ok_id, staging_key=staging_key(user_id=USER_ID, upload_id=ok_id)
            ),
            PhotoUploadInput(
                upload_id=bad_id, staging_key=staging_key(user_id=USER_ID, upload_id=bad_id)
            ),
        ]

        with pytest.raises(ObjectStorageUnavailableError):
            attacher.prepare(inputs, user_id=USER_ID, deadline_seconds=20)


class TestCommit:
    def test_puts_thumbnail_and_copies_to_original(self) -> None:
        storage = FakeObjectStorage(secret="s" * 32)
        upload_id = uuid.uuid4()
        seed(storage, upload_id)
        attacher = make_attacher(storage)
        inputs = [
            PhotoUploadInput(
                upload_id=upload_id, staging_key=staging_key(user_id=USER_ID, upload_id=upload_id)
            )
        ]
        prepared = attacher.prepare(inputs, user_id=USER_ID, deadline_seconds=20)

        attacher.commit(prepared)

        assert storage.head(original_key(user_id=USER_ID, upload_id=upload_id)) is not None
        assert (
            storage.head(thumbnail_key(user_id=USER_ID, upload_id=upload_id, size=50)) is not None
        )


class TestCleanupStaging:
    def test_deletes_staging_object(self) -> None:
        storage = FakeObjectStorage(secret="s" * 32)
        upload_id = uuid.uuid4()
        seed(storage, upload_id)
        attacher = make_attacher(storage)
        inputs = [
            PhotoUploadInput(
                upload_id=upload_id, staging_key=staging_key(user_id=USER_ID, upload_id=upload_id)
            )
        ]
        prepared = attacher.prepare(inputs, user_id=USER_ID, deadline_seconds=20)

        attacher.cleanup_staging(prepared)

        assert storage.head(staging_key(user_id=USER_ID, upload_id=upload_id)) is None

    def test_tolerates_storage_unavailable(self) -> None:
        class FailingDeleteStorage(FakeObjectStorage):
            def delete(self, key: str) -> None:
                raise ObjectStorageUnavailableError("boom")

        storage = FailingDeleteStorage(secret="s" * 32)
        upload_id = uuid.uuid4()
        seed(storage, upload_id)
        attacher = make_attacher(storage)
        inputs = [
            PhotoUploadInput(
                upload_id=upload_id, staging_key=staging_key(user_id=USER_ID, upload_id=upload_id)
            )
        ]
        prepared = attacher.prepare(inputs, user_id=USER_ID, deadline_seconds=20)

        attacher.cleanup_staging(prepared)  # 例外を送出しない
