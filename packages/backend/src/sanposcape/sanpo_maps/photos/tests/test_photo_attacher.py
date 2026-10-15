import io
import logging
import uuid
from datetime import UTC, datetime

import pytest
from PIL import ExifTags, Image

from sanposcape.integrations.aws.s3 import FakeObjectStorage, ObjectStorageUnavailableError
from sanposcape.sanpo_maps.conftest import make_jpeg_bytes
from sanposcape.sanpo_maps.photos.photo_attacher import (
    InvalidPhotoError,
    PhotoAttacher,
    PhotoUploadInput,
    PreparedPhoto,
)
from sanposcape.sanpo_maps.photos.photo_keys import original_key, staging_key, thumbnail_key

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

    def test_passes_taken_at_through_in_input_order(self) -> None:
        storage = FakeObjectStorage(secret="s" * 32)
        upload_ids = [uuid.uuid4() for _ in range(3)]
        for upload_id in upload_ids:
            seed(storage, upload_id)
        attacher = make_attacher(storage)
        taken = [datetime(2026, 7, 2, 0, 14, 5, tzinfo=UTC), None, datetime(2025, 1, 1, tzinfo=UTC)]
        inputs = [
            PhotoUploadInput(
                upload_id=upload_id,
                staging_key=staging_key(user_id=USER_ID, upload_id=upload_id),
                taken_at=value,
            )
            for upload_id, value in zip(upload_ids, taken, strict=True)
        ]

        prepared = attacher.prepare(
            inputs, user_id=USER_ID, deadline_at=attacher.compute_deadline(20)
        )

        assert [item.upload_id for item in prepared] == upload_ids
        assert [item.taken_at for item in prepared] == taken

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
    def test_puts_thumbnail_and_original(self) -> None:
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

    def test_deadline_exceeded_after_thumbnail_put_raises_before_original_put(self) -> None:
        """PR #93 T3 回帰テスト: サムネイルの Put 完了直後・原本の Put 開始前にも締め切りを
        確認する。

        以前は `commit_one` の先頭1回しか確認しておらず、Put が時間予算を使い切った
        後も（当時の）原本の Copy が開始されえた。
        """

        class TrackingStorage(FakeObjectStorage):
            def __init__(self, **kwargs) -> None:
                super().__init__(**kwargs)
                self.put_keys: list[str] = []

            def put_bytes(self, key: str, data: bytes, *, content_type: str) -> None:
                self.put_keys.append(key)
                super().put_bytes(key, data, content_type=content_type)

        storage = TrackingStorage(secret="s" * 32)
        upload_id = uuid.uuid4()
        seed(storage, upload_id)
        prepare_attacher = make_attacher(storage, concurrency=1)
        prepared = prepare_attacher.prepare(
            [
                PhotoUploadInput(
                    upload_id=upload_id,
                    staging_key=staging_key(user_id=USER_ID, upload_id=upload_id),
                )
            ],
            user_id=USER_ID,
            deadline_at=prepare_attacher.compute_deadline(20),
        )
        # 1つ目の呼び出し(サムネイルの Put の前)は締め切り内、2つ目(原本の Put の前)は締め切り超過。
        times = iter([0.0, 20.0])
        commit_attacher = PhotoAttacher(
            storage,
            max_bytes=10 * 1024 * 1024,
            max_pixels=1_000_000,
            thumbnail_max_edge=50,
            thumbnail_quality=80,
            concurrency=1,
            monotonic=lambda: next(times),
        )

        with pytest.raises(ObjectStorageUnavailableError):
            commit_attacher.commit(prepared, deadline_at=10.0)

        assert prepared[0].original_key not in storage.put_keys
        assert storage.head(prepared[0].original_key) is None
        # サムネイルの Put 自体は締め切り確認の前に完了している。
        assert storage.head(prepared[0].thumbnail_key) is not None

    def test_deadline_exceeded_after_all_puts_finish_still_raises(self) -> None:
        """PR #93 T3 回帰テスト: 個々の Put が全て成功しても、全 Future を集約した
        時点（＝最後の原本の Put が終わった後）で締め切りを超えていれば 503 にする。
        """
        storage = FakeObjectStorage(secret="s" * 32)
        upload_id = uuid.uuid4()
        seed(storage, upload_id)
        prepare_attacher = make_attacher(storage, concurrency=1)
        prepared = prepare_attacher.prepare(
            [
                PhotoUploadInput(
                    upload_id=upload_id,
                    staging_key=staging_key(user_id=USER_ID, upload_id=upload_id),
                )
            ],
            user_id=USER_ID,
            deadline_at=prepare_attacher.compute_deadline(20),
        )
        # commit_one 内の2回の確認(サムネイルの Put 前・原本の Put 前)は締め切り内。
        # Future 集約後の確認だけ超過させる。
        times = iter([0.0, 0.0, 999.0])
        commit_attacher = PhotoAttacher(
            storage,
            max_bytes=10 * 1024 * 1024,
            max_pixels=1_000_000,
            thumbnail_max_edge=50,
            thumbnail_quality=80,
            concurrency=1,
            monotonic=lambda: next(times),
        )

        with pytest.raises(ObjectStorageUnavailableError):
            commit_attacher.commit(prepared, deadline_at=10.0)

        # 原本の Put 自体は成功済み（集約時点の確認だけが失敗の原因）。
        assert storage.head(prepared[0].original_key) is not None

    def test_partial_failure_propagates_and_stops_remaining_writes(self) -> None:
        """R3 回帰テスト: 途中の1枚が失敗しても例外が伝播し、以前に成功した分だけが
        original/thumbnail に残る（プランの failure table どおり。DB 未コミットなら
        整合は壊れない）。
        """

        class FlakyOnOriginalPutStorage(FakeObjectStorage):
            def __init__(self, *, fail_key: str, **kwargs) -> None:
                super().__init__(**kwargs)
                self._fail_key = fail_key

            def put_bytes(self, key: str, data: bytes, *, content_type: str) -> None:
                if key == self._fail_key:
                    raise ObjectStorageUnavailableError("boom")
                super().put_bytes(key, data, content_type=content_type)

        ok_id = uuid.uuid4()
        bad_id = uuid.uuid4()
        base_storage = FakeObjectStorage(secret="s" * 32)
        seed(base_storage, ok_id)
        seed(base_storage, bad_id)
        storage = FlakyOnOriginalPutStorage(
            fail_key=original_key(user_id=USER_ID, upload_id=bad_id), secret="s" * 32
        )
        # FlakyOnOriginalPutStorage は独自のオブジェクト辞書を持つので、prepare() が読む
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


class TestMetadataStripping:
    """ADR-009 決定35（SS-116）: 原本はメタデータを除去・検証したバイト列を Put する。"""

    class RecordingStorage(FakeObjectStorage):
        def __init__(self, **kwargs) -> None:
            super().__init__(**kwargs)
            self.copied: list[str] = []

        def copy(self, *, source_key: str, dest_key: str) -> None:
            self.copied.append(dest_key)
            super().copy(source_key=source_key, dest_key=dest_key)

    @staticmethod
    def _gps_jpeg() -> bytes:
        exif = Image.Exif()
        gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
        gps[ExifTags.GPS.GPSProcessingMethod] = b"GPS-SECRET"
        buffer = io.BytesIO()
        Image.new("RGB", (100, 100), color="blue").save(buffer, format="JPEG", exif=exif)
        return buffer.getvalue()

    def _prepare(self, storage: FakeObjectStorage, data: bytes) -> tuple[PhotoAttacher, list]:
        upload_id = uuid.uuid4()
        key = staging_key(user_id=USER_ID, upload_id=upload_id)
        storage.put_bytes(key, data, content_type="image/jpeg")
        attacher = make_attacher(storage)
        prepared = attacher.prepare(
            [PhotoUploadInput(upload_id=upload_id, staging_key=key)],
            user_id=USER_ID,
            deadline_at=attacher.compute_deadline(20),
        )
        return attacher, prepared

    def test_puts_stripped_original_when_metadata_present(self) -> None:
        storage = self.RecordingStorage(secret="s" * 32)
        data = self._gps_jpeg()
        attacher, prepared = self._prepare(storage, data)

        attacher.commit(prepared, deadline_at=attacher.compute_deadline(20))

        item = prepared[0]
        stored = storage.get_bytes(item.original_key, max_bytes=10 * 1024 * 1024)
        assert b"GPS-SECRET" in data
        assert b"GPS-SECRET" not in stored
        assert item.byte_size == len(stored) < len(data)
        assert storage.copied == []
        assert storage.head(item.original_key).content_type == "image/jpeg"

    def test_puts_original_unchanged_when_no_metadata(self) -> None:
        storage = self.RecordingStorage(secret="s" * 32)
        data = make_jpeg_bytes((100, 100))
        attacher, prepared = self._prepare(storage, data)

        attacher.commit(prepared, deadline_at=attacher.compute_deadline(20))

        item = prepared[0]
        assert item.byte_size == len(data)
        assert storage.copied == []
        assert storage.get_bytes(item.original_key, max_bytes=10 * 1024 * 1024) == data

    def test_staging_overwritten_after_prepare_does_not_reach_original(self) -> None:
        """検証の後に同じ枠の staging を上書きされても、原本は検証したバイト列のまま。

        staging から Copy すると、上書きされた未検証（GPS 付き）のバイト列が原本に入る。
        """
        storage = self.RecordingStorage(secret="s" * 32)
        data = make_jpeg_bytes((100, 100))
        attacher, prepared = self._prepare(storage, data)
        storage.put_bytes(prepared[0].staging_key, self._gps_jpeg(), content_type="image/jpeg")

        attacher.commit(prepared, deadline_at=attacher.compute_deadline(20))

        stored = storage.get_bytes(prepared[0].original_key, max_bytes=10 * 1024 * 1024)
        assert stored == data
        assert b"GPS-SECRET" not in stored


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

        attacher.cleanup_staging(prepared, deadline_at=attacher.compute_deadline(20))

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

        attacher.cleanup_staging(
            prepared, deadline_at=attacher.compute_deadline(20)
        )  # 例外を送出しない

    def test_deadline_exceeded_skips_remaining_deletes_and_logs_warning(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """PR #93 T4 回帰テスト: 以前は締め切りの対象外で、S3 が劣化していると無制御に
        時間を消費しうる不具合があった。超過分は削除せず打ち切って WARNING を出す。
        """
        storage = FakeObjectStorage(secret="s" * 32)
        upload_ids = [uuid.uuid4() for _ in range(3)]
        for upload_id in upload_ids:
            seed(storage, upload_id)
        prepare_attacher = make_attacher(storage)
        inputs = [
            PhotoUploadInput(
                upload_id=upload_id, staging_key=staging_key(user_id=USER_ID, upload_id=upload_id)
            )
            for upload_id in upload_ids
        ]
        prepared = prepare_attacher.prepare(
            inputs, user_id=USER_ID, deadline_at=prepare_attacher.compute_deadline(20)
        )
        # 1件目・2件目は締め切り内、3件目の確認時点で超過させる。
        times = iter([0.0, 0.0, 999.0])
        cleanup_attacher = PhotoAttacher(
            storage,
            max_bytes=10 * 1024 * 1024,
            max_pixels=1_000_000,
            thumbnail_max_edge=50,
            thumbnail_quality=80,
            concurrency=3,
            monotonic=lambda: next(times),
        )

        with caplog.at_level(logging.WARNING):
            cleanup_attacher.cleanup_staging(prepared, deadline_at=10.0)

        assert storage.head(staging_key(user_id=USER_ID, upload_id=upload_ids[0])) is None
        assert storage.head(staging_key(user_id=USER_ID, upload_id=upload_ids[1])) is None
        # 3件目は締め切り超過のため削除されずに残る（S3 のライフサイクルで最終的に消える）。
        assert storage.head(staging_key(user_id=USER_ID, upload_id=upload_ids[2])) is not None
        assert any(
            "Skipping remaining staging cleanup" in record.message for record in caplog.records
        )
