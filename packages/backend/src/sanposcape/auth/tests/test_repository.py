"""`RefreshTokenRepository.get_by_hash_for_update()` の行ロックが実際に効いていることの検証。

`FOR UPDATE` はロック範囲やトランザクション境界のズレで簡単に無効化されるが、通常の
逐次実行テストではその劣化を検知できない。`threading.Thread` + 別 `Session`（= 別コネクション）
で実際に2本同時アクセスさせ、後発が先発のトランザクション終了までブロックされることを
実DB（PostgreSQL）で検証する（ローカルレビューB-2）。
"""

import threading
import time
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from sanposcape.auth.repository import RefreshTokenRepository
from sanposcape.conftest import TestSessionLocal
from sanposcape.users.models import User

_LOCK_WAIT_TIMEOUT = 5.0


@pytest.fixture
def existing_token_hash(db_session: Session) -> str:
    user = User(
        provider="google",
        provider_subject="concurrency-sub",
        email=None,
        display_name=None,
        photo_url=None,
    )
    db_session.add(user)
    db_session.flush()

    repo = RefreshTokenRepository(db_session)
    row = repo.create(
        user_id=user.id,
        token_hash="c" * 64,
        family_id=uuid.uuid4(),
        expires_at=datetime.now(UTC) + timedelta(days=1),
    )
    # 別コネクションのスレッドから見えるようにコミットしておく。
    db_session.commit()
    return row.token_hash


def test_get_by_hash_for_update_blocks_concurrent_transaction(
    existing_token_hash: str,
) -> None:
    """先発トランザクションがロックを保持している間、後発は `get_by_hash_for_update()` の
    呼び出し自体がブロックされ、先発のコミット後にようやく進むことを検証する。
    """
    events: list[str] = []
    events_lock = threading.Lock()

    def _record(event: str) -> None:
        with events_lock:
            events.append(event)

    holder_locked = threading.Event()
    holder_may_release = threading.Event()
    errors: list[BaseException] = []

    def _holder() -> None:
        session = TestSessionLocal()
        try:
            repo = RefreshTokenRepository(session)
            repo.get_by_hash_for_update(existing_token_hash)  # ここで行ロックを取得
            _record("holder_locked")
            holder_locked.set()
            # waiter が本当にブロックされていることを確認する時間を確保する。
            holder_may_release.wait(timeout=_LOCK_WAIT_TIMEOUT)
            _record("holder_committed")
            session.commit()  # ここでロック解放
        except BaseException as exc:  # noqa: BLE001 - スレッド内例外をテスト本体に伝える
            errors.append(exc)
            holder_locked.set()
        finally:
            session.close()

    def _waiter() -> None:
        try:
            assert holder_locked.wait(timeout=_LOCK_WAIT_TIMEOUT)
            session = TestSessionLocal()
            try:
                repo = RefreshTokenRepository(session)
                # holder が commit するまでブロックされるはず。
                repo.get_by_hash_for_update(existing_token_hash)
                _record("waiter_locked")
                session.commit()
            finally:
                session.close()
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    holder_thread = threading.Thread(target=_holder)
    waiter_thread = threading.Thread(target=_waiter)

    holder_thread.start()
    assert holder_locked.wait(timeout=_LOCK_WAIT_TIMEOUT), "holder がロックを取得できなかった"
    waiter_thread.start()

    # waiter が holder のコミット前に完了していないことを確認する（早すぎる完了は
    # with_for_update() がロックとして機能していないことの証拠になる）。
    time.sleep(0.3)
    with events_lock:
        assert "waiter_locked" not in events, (
            "get_by_hash_for_update() が行ロックとして機能していない"
            "（waiter が holder のコミット前に進んでしまった）"
        )

    holder_may_release.set()
    holder_thread.join(timeout=_LOCK_WAIT_TIMEOUT)
    waiter_thread.join(timeout=_LOCK_WAIT_TIMEOUT)

    assert not holder_thread.is_alive(), "holder スレッドがタイムアウトした"
    assert not waiter_thread.is_alive(), "waiter スレッドがタイムアウトした"
    assert not errors, f"スレッド内で例外が発生した: {errors}"
    assert events == ["holder_locked", "holder_committed", "waiter_locked"]
