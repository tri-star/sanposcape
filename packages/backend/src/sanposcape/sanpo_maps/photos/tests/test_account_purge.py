"""アカウント削除後の写真の削除（SS-109 / ADR-009 決定35）。"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from sanposcape.conftest import TestSessionLocal
from sanposcape.integrations.aws.s3 import (
    FakeObjectStorage,
    ObjectStorageUnavailableError,
    UnconfiguredObjectStorage,
)
from sanposcape.sanpo_maps.models import AccountPhotoPurge
from sanposcape.sanpo_maps.photos.account_purge import (
    AccountPhotoPurgeResult,
    AccountPhotoPurgeScheduler,
)
from sanposcape.sanpo_maps.photos.photo_keys import original_key, staging_key, thumbnail_key
from sanposcape.sanpo_maps.photos.repository import AccountPhotoPurgeRepository
from sanposcape.sanpo_maps.photos.service import AccountPhotoPurgeService

NOW = datetime(2026, 11, 20, 3, 0, tzinfo=UTC)


def _user_keys(user_id: uuid.UUID, count: int = 1) -> list[str]:
    keys: list[str] = []
    for _ in range(count):
        upload_id = uuid.uuid4()
        keys += [
            staging_key(user_id=user_id, upload_id=upload_id),
            original_key(user_id=user_id, upload_id=upload_id),
            thumbnail_key(user_id=user_id, upload_id=upload_id, size=512),
        ]
    return keys


def _put(storage: FakeObjectStorage, keys: list[str]) -> None:
    for key in keys:
        storage.put_bytes(key, b"x", content_type="image/jpeg")


def _remaining(storage: FakeObjectStorage, keys: list[str]) -> list[str]:
    return [key for key in keys if storage.head(key) is not None]


def _add_purge(db_session: Session, user_id: uuid.UUID, *, purge_after: datetime) -> None:
    db_session.add(
        AccountPhotoPurge(
            user_id=user_id, requested_at=purge_after - timedelta(days=30), purge_after=purge_after
        )
    )
    db_session.commit()


def _purge_user_ids() -> set[uuid.UUID]:
    with TestSessionLocal() as other:
        return set(other.scalars(select(AccountPhotoPurge.user_id)))


def _service(
    db_session: Session,
    storage: object,
    *,
    batch_size: int = 100,
    deadline_seconds: float = 60,
    monotonic=lambda: 0.0,
) -> AccountPhotoPurgeService:
    return AccountPhotoPurgeService(
        db_session,
        AccountPhotoPurgeRepository(db_session),
        storage,  # type: ignore[arg-type]
        batch_size=batch_size,
        deadline_seconds=deadline_seconds,
        now=lambda: NOW,
        monotonic=monotonic,
    )


@pytest.fixture
def storage() -> FakeObjectStorage:
    return FakeObjectStorage(secret="s" * 32)


class TestAccountPhotoPurgeScheduler:
    def test_schedules_after_the_retention_period(self, db_session: Session) -> None:
        user_id = uuid.uuid4()
        AccountPhotoPurgeScheduler(db_session, retention_days=7, now=lambda: NOW).schedule(user_id)
        db_session.commit()

        purge = db_session.get(AccountPhotoPurge, user_id)
        assert purge is not None
        assert (purge.requested_at, purge.purge_after) == (NOW, NOW + timedelta(days=7))

    def test_does_not_commit(self, db_session: Session) -> None:
        """呼び出し元（アカウント削除）のトランザクションに乗る。"""
        user_id = uuid.uuid4()
        AccountPhotoPurgeScheduler(db_session, retention_days=30).schedule(user_id)

        assert _purge_user_ids() == set()
        db_session.rollback()
        assert db_session.get(AccountPhotoPurge, user_id) is None


class TestAccountPhotoPurgeService:
    def test_purges_due_accounts_only_and_keeps_other_users(
        self, db_session: Session, storage: FakeObjectStorage
    ) -> None:
        due, not_yet, active = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        due_keys, not_yet_keys, active_keys = (
            _user_keys(due, 2),
            _user_keys(not_yet),
            _user_keys(active),
        )
        _put(storage, due_keys + not_yet_keys + active_keys)
        _add_purge(db_session, due, purge_after=NOW)
        _add_purge(db_session, not_yet, purge_after=NOW + timedelta(seconds=1))

        result = _service(db_session, storage).purge_due()

        assert result == AccountPhotoPurgeResult(
            due=1, purged=1, failed=0, deferred=0, deleted_objects=6
        )
        assert _remaining(storage, due_keys) == []
        assert _remaining(storage, not_yet_keys) == not_yet_keys
        assert _remaining(storage, active_keys) == active_keys
        assert _purge_user_ids() == {not_yet}

    def test_account_without_photos_is_purged(
        self, db_session: Session, storage: FakeObjectStorage
    ) -> None:
        user_id = uuid.uuid4()
        _add_purge(db_session, user_id, purge_after=NOW)

        result = _service(db_session, storage).purge_due()

        assert (result.purged, result.deleted_objects) == (1, 0)
        assert _purge_user_ids() == set()

    def test_deletes_page_by_page_until_the_prefix_is_empty(
        self, db_session: Session, storage: FakeObjectStorage, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("sanposcape.sanpo_maps.photos.service.S3_DELETE_OBJECTS_MAX_KEYS", 2)
        user_id = uuid.uuid4()
        keys = _user_keys(user_id, 5)
        _put(storage, keys)
        _add_purge(db_session, user_id, purge_after=NOW)
        listed: list[int] = []
        original_list_keys = storage.list_keys

        def recording_list_keys(prefix: str, *, max_keys: int) -> list[str]:
            assert max_keys == 2
            found = original_list_keys(prefix, max_keys=max_keys)
            listed.append(len(found))
            return found

        monkeypatch.setattr(storage, "list_keys", recording_list_keys)

        result = _service(db_session, storage).purge_due()

        assert result.deleted_objects == 15
        assert _remaining(storage, keys) == []
        # prefix ごとに 5 件 → 2, 2, 1, 0（空の確認）
        assert listed == [2, 2, 1, 0] * 3

    def test_s3_is_called_outside_a_db_transaction(
        self, db_session: Session, storage: FakeObjectStorage, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """S3 を呼ぶ間に DB の接続（トランザクション）を握らない。"""
        user_id = uuid.uuid4()
        _put(storage, _user_keys(user_id))
        _add_purge(db_session, user_id, purge_after=NOW)
        in_transaction: list[bool] = []
        original_list_keys = storage.list_keys

        def checking_list_keys(prefix: str, *, max_keys: int) -> list[str]:
            in_transaction.append(db_session.in_transaction())
            return original_list_keys(prefix, max_keys=max_keys)

        monkeypatch.setattr(storage, "list_keys", checking_list_keys)

        _service(db_session, storage).purge_due()

        assert in_transaction
        assert not any(in_transaction)

    def test_failed_deletion_keeps_the_purge_and_continues_with_others(
        self, db_session: Session, storage: FakeObjectStorage, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        failing, other = uuid.uuid4(), uuid.uuid4()
        failing_keys, other_keys = _user_keys(failing), _user_keys(other)
        _put(storage, failing_keys + other_keys)
        _add_purge(db_session, failing, purge_after=NOW - timedelta(days=1))
        _add_purge(db_session, other, purge_after=NOW)
        original_delete_many = storage.delete_many

        def partly_failing_delete_many(keys: list[str]) -> list[str]:
            original_delete_many(keys)
            return [key for key in keys if f"/{failing}/" in key]

        monkeypatch.setattr(storage, "delete_many", partly_failing_delete_many)

        result = _service(db_session, storage).purge_due()

        assert (result.due, result.purged, result.failed) == (2, 1, 1)
        assert _purge_user_ids() == {failing}
        assert _remaining(storage, other_keys) == []

    def test_listing_failure_keeps_the_purge(
        self, db_session: Session, storage: FakeObjectStorage, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        user_id = uuid.uuid4()
        _add_purge(db_session, user_id, purge_after=NOW)

        def failing_list_keys(prefix: str, *, max_keys: int) -> list[str]:
            raise ObjectStorageUnavailableError("timeout")

        monkeypatch.setattr(storage, "list_keys", failing_list_keys)

        result = _service(db_session, storage).purge_due()

        assert (result.purged, result.failed) == (0, 1)
        assert _purge_user_ids() == {user_id}

    def test_unconfigured_storage_keeps_every_purge(self, db_session: Session) -> None:
        user_id = uuid.uuid4()
        _add_purge(db_session, user_id, purge_after=NOW)

        result = _service(db_session, UnconfiguredObjectStorage()).purge_due()

        assert (result.purged, result.failed) == (0, 1)
        assert _purge_user_ids() == {user_id}

    def test_deadline_defers_the_rest_to_the_next_run(
        self, db_session: Session, storage: FakeObjectStorage
    ) -> None:
        """締め切りを過ぎたら新しい S3 の呼び出しを始めず、残りの予約を持ち越す。"""
        first, second = uuid.uuid4(), uuid.uuid4()
        first_keys, second_keys = _user_keys(first), _user_keys(second)
        _put(storage, first_keys + second_keys)
        _add_purge(db_session, first, purge_after=NOW - timedelta(days=1))
        _add_purge(db_session, second, purge_after=NOW)
        # 締め切り 10 秒。S3 の呼び出しの前の確認ごとに 1 秒進む: 1人目は 3 prefix ×（列挙1回 +
        # 空の確認1回）= 6 回で終わり、2人目の 4 回目の確認（10 秒）で打ち切る。
        clock = iter(range(1000))

        result = _service(
            db_session, storage, deadline_seconds=10, monotonic=lambda: float(next(clock))
        ).purge_due()

        assert result == AccountPhotoPurgeResult(
            due=2, purged=1, failed=0, deferred=1, deleted_objects=5
        )
        assert _purge_user_ids() == {second}
        assert _remaining(storage, first_keys) == []
        # 2人目は staging と original だけ消えて thumb が残る（次回に続きから消す）
        assert _remaining(storage, second_keys) == second_keys[2:]

    def test_batch_size_limits_the_accounts_per_run_oldest_first(
        self, db_session: Session, storage: FakeObjectStorage
    ) -> None:
        older, newer = uuid.uuid4(), uuid.uuid4()
        _add_purge(db_session, newer, purge_after=NOW)
        _add_purge(db_session, older, purge_after=NOW - timedelta(days=1))

        result = _service(db_session, storage, batch_size=1).purge_due()

        assert (result.due, result.purged) == (1, 1)
        assert _purge_user_ids() == {newer}
