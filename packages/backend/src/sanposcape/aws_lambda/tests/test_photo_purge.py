"""アカウント削除後の写真を消す Lambda ハンドラ（SS-109）。"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from sanposcape.aws_lambda import photo_purge
from sanposcape.conftest import TestSessionLocal
from sanposcape.integrations.aws.s3 import FakeObjectStorage
from sanposcape.sanpo_maps.models import AccountPhotoPurge
from sanposcape.sanpo_maps.photos.photo_keys import original_key


@pytest.fixture
def storage(monkeypatch: pytest.MonkeyPatch) -> FakeObjectStorage:
    fake = FakeObjectStorage(secret="s" * 32)
    monkeypatch.setattr(photo_purge, "build_object_storage", lambda settings: fake)
    monkeypatch.setattr(photo_purge, "get_session_factory", lambda: TestSessionLocal)
    return fake


def _add_due_purge(db_session: Session, user_id: uuid.UUID) -> None:
    past = datetime.now(UTC) - timedelta(days=1)
    db_session.add(AccountPhotoPurge(user_id=user_id, requested_at=past, purge_after=past))
    db_session.commit()


def test_purges_due_accounts_and_returns_the_summary(
    db_session: Session, storage: FakeObjectStorage
) -> None:
    user_id = uuid.uuid4()
    key = original_key(user_id=user_id, upload_id=uuid.uuid4())
    storage.put_bytes(key, b"x", content_type="image/jpeg")
    _add_due_purge(db_session, user_id)

    summary = photo_purge.handler({}, None)

    assert summary == {"due": 1, "purged": 1, "failed": 0, "deferred": 0, "deleted_objects": 1}
    assert storage.head(key) is None
    db_session.expire_all()
    assert db_session.get(AccountPhotoPurge, user_id) is None


def test_fails_the_invocation_when_an_account_could_not_be_purged(
    db_session: Session, storage: FakeObjectStorage, monkeypatch: pytest.MonkeyPatch
) -> None:
    """S3 の失敗は実行の失敗にする（Errors のアラームで気付く）。予約は残る。"""
    user_id = uuid.uuid4()
    storage.put_bytes(
        original_key(user_id=user_id, upload_id=uuid.uuid4()), b"x", content_type="image/jpeg"
    )
    _add_due_purge(db_session, user_id)
    monkeypatch.setattr(storage, "delete_many", lambda keys: list(keys))

    with pytest.raises(photo_purge.AccountPhotoPurgeIncompleteError):
        photo_purge.handler({}, None)

    db_session.expire_all()
    assert db_session.get(AccountPhotoPurge, user_id) is not None
