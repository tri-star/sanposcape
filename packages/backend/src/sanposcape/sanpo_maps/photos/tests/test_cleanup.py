import logging

import pytest

import sanposcape.sanpo_maps.photos.cleanup
from sanposcape.integrations.aws.s3 import FakeObjectStorage, UnconfiguredObjectStorage
from sanposcape.sanpo_maps.photos.cleanup import PhotoObjectCleaner, flatten_photo_keys


def _put_objects(storage: FakeObjectStorage, keys: list[str]) -> None:
    for key in keys:
        storage.put_bytes(key, b"data", content_type="application/octet-stream")


def _wrap_delete_many(storage: FakeObjectStorage) -> list[list[str]]:
    """呼ばれたチャンクを記録しつつ、元の（実際に削除する）`delete_many` に委譲する。"""
    chunks: list[list[str]] = []
    original = storage.delete_many

    def recording_delete_many(keys: list[str]) -> list[str]:
        chunks.append(list(keys))
        return original(keys)

    storage.delete_many = recording_delete_many  # type: ignore[method-assign]
    return chunks


class TestFlattenPhotoKeys:
    def test_excludes_none(self) -> None:
        pairs = [("a", "a-thumb"), ("b", None)]
        assert flatten_photo_keys(pairs) == ["a", "a-thumb", "b"]

    def test_empty_input_returns_empty_list(self) -> None:
        assert flatten_photo_keys([]) == []


class TestPhotoObjectCleanerDeleteBestEffort:
    """削除の時間予算判定（ADR-009 決定22 追補, SS-112 PR #101 レビュー対応）を、
    `PhotoObjectCleaner` 単体で確認する（ADR-011）。写真2枚（キー4つ）ぶんのキーを、
    `S3_DELETE_OBJECTS_MAX_KEYS` を2に差し替えてチャンク2つに分ける。ピンを作らずに
    書けるので短くなる。
    """

    def test_second_chunk_is_skipped_when_remaining_time_is_below_worst_case(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        monkeypatch.setattr(sanposcape.sanpo_maps.photos.cleanup, "S3_DELETE_OBJECTS_MAX_KEYS", 2)
        storage = FakeObjectStorage(secret="s" * 32)
        keys = ["k0", "k1", "k2", "k3"]
        _put_objects(storage, keys)
        chunks = _wrap_delete_many(storage)
        monotonic_values = iter([0.0, 4.5])  # deadline_at=10, remaining=5.5 < worst_case=6
        cleaner = PhotoObjectCleaner(
            storage,
            deadline_seconds=10,
            call_worst_case_seconds=6,
            monotonic=lambda: next(monotonic_values),
        )

        with caplog.at_level(logging.WARNING, logger="sanposcape.sanpo_maps.photos.cleanup"):
            cleaner.delete_best_effort(keys)

        assert len(chunks) == 1
        assert storage.head(keys[0]) is None
        assert storage.head(keys[1]) is None
        assert storage.head(keys[2]) is not None
        assert storage.head(keys[3]) is not None
        assert any(
            "not enough time" in record.getMessage() and "2 of 4" in record.getMessage()
            for record in caplog.records
        )

    def test_second_chunk_starts_when_remaining_time_equals_worst_case(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        monkeypatch.setattr(sanposcape.sanpo_maps.photos.cleanup, "S3_DELETE_OBJECTS_MAX_KEYS", 2)
        storage = FakeObjectStorage(secret="s" * 32)
        keys = ["k0", "k1", "k2", "k3"]
        _put_objects(storage, keys)
        chunks = _wrap_delete_many(storage)
        monotonic_values = iter([0.0, 4.0])  # deadline_at=10, remaining=6.0 == worst_case
        cleaner = PhotoObjectCleaner(
            storage,
            deadline_seconds=10,
            call_worst_case_seconds=6,
            monotonic=lambda: next(monotonic_values),
        )

        with caplog.at_level(logging.WARNING, logger="sanposcape.sanpo_maps.photos.cleanup"):
            cleaner.delete_best_effort(keys)

        assert len(chunks) == 2
        for key in keys:
            assert storage.head(key) is None
        assert not any("not enough time" in record.getMessage() for record in caplog.records)

    def test_first_chunk_is_always_attempted_regardless_of_remaining_time(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(sanposcape.sanpo_maps.photos.cleanup, "S3_DELETE_OBJECTS_MAX_KEYS", 2)
        storage = FakeObjectStorage(secret="s" * 32)
        keys = ["k0", "k1", "k2", "k3"]
        _put_objects(storage, keys)
        chunks = _wrap_delete_many(storage)
        monotonic_values = iter([0.0, 1_000.0])
        # 締め切り(1秒) + 最悪時間(6秒) は Settings のバリデーション（<=25秒）なら通る組み合わせ
        # だが、ここでは cleaner に直接注入しているため Settings の検証は経由しない。
        cleaner = PhotoObjectCleaner(
            storage,
            deadline_seconds=1,
            call_worst_case_seconds=6,
            monotonic=lambda: next(monotonic_values),
        )

        cleaner.delete_best_effort(keys)

        # 最初のチャンクは残り時間によらず必ず試みるため実体が消え、2つ目は打ち切られる。
        assert len(chunks) == 1
        assert storage.head(keys[0]) is None
        assert storage.head(keys[1]) is None
        assert storage.head(keys[2]) is not None
        assert storage.head(keys[3]) is not None

    def test_empty_keys_does_not_call_storage(self) -> None:
        storage = FakeObjectStorage(secret="s" * 32)
        chunks = _wrap_delete_many(storage)
        cleaner = PhotoObjectCleaner(storage, deadline_seconds=10, call_worst_case_seconds=6)

        cleaner.delete_best_effort([])

        assert chunks == []

    def test_storage_delete_failure_does_not_raise(self, caplog: pytest.LogCaptureFixture) -> None:
        storage = FakeObjectStorage(secret="s" * 32)
        _put_objects(storage, ["k0"])

        def failing_delete_many(keys: list[str]) -> list[str]:
            return list(keys)  # 全キーが削除に失敗したとして返す

        storage.delete_many = failing_delete_many  # type: ignore[method-assign]
        cleaner = PhotoObjectCleaner(storage, deadline_seconds=10, call_worst_case_seconds=6)

        with caplog.at_level(logging.WARNING, logger="sanposcape.sanpo_maps.photos.cleanup"):
            cleaner.delete_best_effort(["k0"])  # 例外を投げない

        assert any("Failed to delete" in record.getMessage() for record in caplog.records)

    def test_unexpected_storage_exception_does_not_raise(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """R3: `ObjectStorageUnavailableError` 以外の想定外の例外（実装のバグ等）でも、
        DB commit 後の best-effort 境界では例外を外へ出さず WARNING ログに留める。
        """
        storage = FakeObjectStorage(secret="s" * 32)
        _put_objects(storage, ["k0"])

        def raising_delete_many(keys: list[str]) -> list[str]:
            raise RuntimeError("boom")

        storage.delete_many = raising_delete_many  # type: ignore[method-assign]
        cleaner = PhotoObjectCleaner(storage, deadline_seconds=10, call_worst_case_seconds=6)

        with caplog.at_level(logging.WARNING, logger="sanposcape.sanpo_maps.photos.cleanup"):
            cleaner.delete_best_effort(["k0"])  # 例外を投げない

        assert any(
            "Failed to delete" in record.getMessage() and "RuntimeError" in record.getMessage()
            for record in caplog.records
        )

    def test_unconfigured_storage_does_not_raise(self) -> None:
        cleaner = PhotoObjectCleaner(
            UnconfiguredObjectStorage(), deadline_seconds=10, call_worst_case_seconds=6
        )

        cleaner.delete_best_effort(["k0"])  # 例外を投げない
