import uuid

import pytest

from sanposcape.integrations.aws.s3 import FakeObjectStorage, ObjectStorageUnavailableError
from sanposcape.pins.photo_attacher import (
    InvalidPhotoError,
    PhotoAttacher,
    PhotoUploadInput,
    PreparedPhoto,
)
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

        prepared = attacher.prepare(
            inputs, user_id=USER_ID, deadline_at=attacher.compute_deadline(20)
        )

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
            attacher.prepare(inputs, user_id=USER_ID, deadline_at=attacher.compute_deadline(20))

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
            attacher.prepare(inputs, user_id=USER_ID, deadline_at=attacher.compute_deadline(20))

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
            # 負の deadline_seconds で compute_deadline() を呼び、開始時点で既に
            # 期限切れの締め切りを作る。
            attacher.prepare(inputs, user_id=USER_ID, deadline_at=attacher.compute_deadline(-1))

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
            attacher.prepare(inputs, user_id=USER_ID, deadline_at=attacher.compute_deadline(20))


def _prepare_n(
    attacher: PhotoAttacher, storage: FakeObjectStorage, count: int
) -> list[PreparedPhoto]:
    upload_ids = [uuid.uuid4() for _ in range(count)]
    for upload_id in upload_ids:
        seed(storage, upload_id)
    inputs = [
        PhotoUploadInput(
            upload_id=upload_id, staging_key=staging_key(user_id=USER_ID, upload_id=upload_id)
        )
        for upload_id in upload_ids
    ]
    return attacher.prepare(inputs, user_id=USER_ID, deadline_at=attacher.compute_deadline(20))


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
        prepared = attacher.prepare(
            inputs, user_id=USER_ID, deadline_at=attacher.compute_deadline(20)
        )

        attacher.commit(prepared, deadline_at=attacher.compute_deadline(20))

        assert storage.head(original_key(user_id=USER_ID, upload_id=upload_id)) is not None
        assert (
            storage.head(thumbnail_key(user_id=USER_ID, upload_id=upload_id, size=50)) is not None
        )

    def test_commits_all_photos_in_parallel(self) -> None:
        """R2 回帰テスト: `commit()` も `prepare()` と同じ並列度で複数枚を処理する。"""
        storage = FakeObjectStorage(secret="s" * 32)
        attacher = make_attacher(storage, concurrency=3)
        prepared = _prepare_n(attacher, storage, 5)

        attacher.commit(prepared, deadline_at=attacher.compute_deadline(20))

        for item in prepared:
            assert storage.head(item.original_key) is not None
            assert storage.head(item.thumbnail_key) is not None

    def test_deadline_exceeded_raises_object_storage_unavailable(self) -> None:
        """R2 回帰テスト: `commit()` にも締め切りチェックが効く（以前は無期限だった）。"""
        storage = FakeObjectStorage(secret="s" * 32)
        attacher = PhotoAttacher(
            storage,
            max_bytes=10 * 1024 * 1024,
            max_pixels=1_000_000,
            thumbnail_max_edge=50,
            thumbnail_quality=80,
            concurrency=1,
        )
        prepared = _prepare_n(attacher, storage, 1)
        # commit 開始前には既に期限切れの締め切りを渡す。
        past_deadline = attacher.compute_deadline(-1)

        with pytest.raises(ObjectStorageUnavailableError):
            attacher.commit(prepared, deadline_at=past_deadline)

        assert storage.head(prepared[0].original_key) is None

    def test_partial_failure_propagates_and_stops_remaining_writes(self) -> None:
        """R3 回帰テスト: 途中の1枚が失敗しても例外が伝播し、以前に成功した分だけが
        original/thumbnail に残る（プランの failure table どおり。DB 未コミットなら
        整合は壊れない）。
        """

        class FlakyOnCopyStorage(FakeObjectStorage):
            def __init__(self, *, fail_key: str, **kwargs) -> None:
                super().__init__(**kwargs)
                self._fail_key = fail_key

            def copy(self, *, source_key: str, dest_key: str) -> None:
                if source_key == self._fail_key:
                    raise ObjectStorageUnavailableError("boom")
                super().copy(source_key=source_key, dest_key=dest_key)

        ok_id = uuid.uuid4()
        bad_id = uuid.uuid4()
        base_storage = FakeObjectStorage(secret="s" * 32)
        seed(base_storage, ok_id)
        seed(base_storage, bad_id)
        storage = FlakyOnCopyStorage(
            fail_key=staging_key(user_id=USER_ID, upload_id=bad_id), secret="s" * 32
        )
        # FlakyOnCopyStorage は独自のオブジェクト辞書を持つので、prepare() が読む
        # staging データを改めて置いておく。
        seed(storage, ok_id)
        seed(storage, bad_id)
        attacher = make_attacher(storage, concurrency=1)
        inputs = [
            PhotoUploadInput(
                upload_id=ok_id, staging_key=staging_key(user_id=USER_ID, upload_id=ok_id)
            ),
            PhotoUploadInput(
                upload_id=bad_id, staging_key=staging_key(user_id=USER_ID, upload_id=bad_id)
            ),
        ]
        prepared = attacher.prepare(
            inputs, user_id=USER_ID, deadline_at=attacher.compute_deadline(20)
        )

        with pytest.raises(ObjectStorageUnavailableError):
            attacher.commit(prepared, deadline_at=attacher.compute_deadline(20))

        ok_item = next(item for item in prepared if item.upload_id == ok_id)
        bad_item = next(item for item in prepared if item.upload_id == bad_id)
        assert storage.head(ok_item.original_key) is not None
        assert storage.head(bad_item.original_key) is None


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
        prepared = attacher.prepare(
            inputs, user_id=USER_ID, deadline_at=attacher.compute_deadline(20)
        )

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
        prepared = attacher.prepare(
            inputs, user_id=USER_ID, deadline_at=attacher.compute_deadline(20)
        )

        attacher.cleanup_staging(prepared)  # 例外を送出しない
