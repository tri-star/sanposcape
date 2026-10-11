"""地図削除とピンの移動の並行実行（ADR-009 決定33, SS-175）。

`threading.Thread` + 別 `Session`（= 別コネクション）で実 DB 上の真の競合を再現する
（`pins/tests/test_service.py::TestCreatePinTrueConcurrentIdempotentResend` と同じ手法）。
固定するのは次の3点。デッドロックしないことの網羅はテストせず、ADR-009 決定33 の分析で担保する
（3点目は分析で見つかった具体的なデッドロックの回帰テスト）。

- 移動中（未 commit）のピンがある地図を削除しても、移動先で生き残るピンの写真は S3 から消えない
- 移動先の地図が同時に削除されたら、移動は 500 ではなく `SanpoMapNotFoundError`（404）になる
- 今と同じ地図の ID を送る PATCH と地図削除が、ピン行 ↔ 地図行のロック順の食い違いで
  デッドロックしない

別スレッドがロック待ちに入ったかどうかは固定 sleep ではなく `pg_stat_activity` の
`wait_event_type = 'Lock'` をポーリングして判定する。
"""

import threading
import time
import uuid
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from sanposcape.conftest import TestSessionLocal
from sanposcape.integrations.aws.s3 import FakeObjectStorage
from sanposcape.sanpo_maps.conftest import (
    BASE_URL,
    create_pin_photo_row,
    make_pin_service,
    make_user,
)
from sanposcape.sanpo_maps.exceptions import PinNotFoundError, SanpoMapNotFoundError
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.maps.service import SanpoMapService
from sanposcape.sanpo_maps.models import Pin, SanpoMap
from sanposcape.sanpo_maps.photos.cleanup import PhotoObjectCleaner
from sanposcape.sanpo_maps.pins.repository import PinRepository
from sanposcape.sanpo_maps.pins.schemas import PinUpdate
from sanposcape.users.models import User

_LOCK_WAIT_TIMEOUT = 5.0
_POLL_INTERVAL = 0.02


def _wait_for_lock_waiter(timeout: float = _LOCK_WAIT_TIMEOUT) -> bool:
    """別セッションがロック待ち（`wait_event_type = 'Lock'`）に入るまで最大 `timeout` 秒待つ。

    固定 sleep だと遅い環境で「待ちに入る前」に判定してしまうため、DB 側の待機状態を見る。
    入ったら True、タイムアウトしたら False。
    """
    deadline = time.monotonic() + timeout
    session = TestSessionLocal()
    try:
        while time.monotonic() < deadline:
            waiting = session.execute(
                text(
                    "SELECT count(*) FROM pg_stat_activity "
                    "WHERE datname = current_database() AND pid <> pg_backend_pid() "
                    "AND wait_event_type = 'Lock'"
                )
            ).scalar_one()
            if waiting:
                return True
            time.sleep(_POLL_INTERVAL)
            session.rollback()  # 毎回新しいスナップショットで見る
        return False
    finally:
        session.close()


def _setup(db_session: Session, storage: FakeObjectStorage):
    """owner / 地図 A（既定）/ 地図 B / A のピン P（写真1枚つき）を作る。"""
    owner = make_user(db_session, subject="race-owner")
    repo = SanpoMapRepository(db_session)
    map_a, _ = repo.create_with_owner(owner_user_id=owner.id, name="A", is_default=True)
    map_b, _ = repo.create_with_owner(owner_user_id=owner.id, name="B", is_default=False)
    db_session.commit()
    pin, _created = PinRepository(db_session).create(
        sanpo_map_id=map_a.id,
        created_by_user_id=owner.id,
        client_pin_id=uuid.uuid4(),
        name="P",
        memo=None,
        latitude=0,
        longitude=0,
        client_walk_id=None,
    )
    db_session.commit()
    photo = create_pin_photo_row(
        db_session, storage, pin_id=pin.id, uploaded_by_user_id=owner.id, position=0
    )
    assert photo.thumbnail_s3_key is not None
    return owner.id, map_a.id, map_b.id, pin.id, photo


def _map_exists(sanpo_map_id: uuid.UUID) -> bool:
    session = TestSessionLocal()
    try:
        return session.get(SanpoMap, sanpo_map_id) is not None
    finally:
        session.close()


def _pin_map_id(pin_id: uuid.UUID) -> uuid.UUID | None:
    session = TestSessionLocal()
    try:
        pin = session.get(Pin, pin_id)
        return None if pin is None else pin.sanpo_map_id
    finally:
        session.close()


class TestDeleteSourceMapWhilePinIsBeingMoved:
    """移動元の地図の削除 × ピンの移動（修正前は生き残るピンの写真の実体が消えていた）。"""

    def test_surviving_pin_keeps_its_s3_objects(self, db_session: Session) -> None:
        storage = FakeObjectStorage(secret="s" * 32)
        owner_id, map_a, map_b, pin_id, photo = _setup(db_session, storage)
        thumb_key = photo.thumbnail_s3_key
        original_key = photo.s3_key

        holder_locked = threading.Event()
        holder_may_commit = threading.Event()
        waiter_done = threading.Event()
        errors: list[BaseException] = []

        def _holder() -> None:
            session = TestSessionLocal()
            try:
                owner = session.get(User, owner_id)
                assert owner is not None
                repo = PinRepository(session)
                result = repo.get_for_member_for_update(user_id=owner_id, pin_id=pin_id)
                assert result is not None
                pin, _role = result
                repo.update_fields(pin, sanpo_map_id=map_b, updated_at=datetime.now(UTC))
                holder_locked.set()
                holder_may_commit.wait(timeout=_LOCK_WAIT_TIMEOUT)
                session.commit()
            except BaseException as exc:  # noqa: BLE001 - スレッド内例外をテスト本体に伝える
                errors.append(exc)
                holder_locked.set()
            finally:
                session.close()

        def _waiter() -> None:
            session = TestSessionLocal()
            try:
                owner = session.get(User, owner_id)
                assert owner is not None
                service = SanpoMapService(
                    session,
                    SanpoMapRepository(session),
                    PhotoObjectCleaner(storage, deadline_seconds=10, call_worst_case_seconds=6),
                )
                service.delete_map(owner, map_a)
            except BaseException as exc:  # noqa: BLE001
                errors.append(exc)
            finally:
                waiter_done.set()
                session.close()

        holder_thread = threading.Thread(target=_holder)
        waiter_thread = threading.Thread(target=_waiter)
        holder_thread.start()
        assert holder_locked.wait(timeout=_LOCK_WAIT_TIMEOUT)
        waiter_thread.start()

        assert _wait_for_lock_waiter(), "地図削除がロック待ちに入らなかった(競合の再現に失敗)"
        assert not waiter_done.is_set(), "地図削除が移動の commit 前に完了した(競合の再現に失敗)"

        holder_may_commit.set()
        holder_thread.join(timeout=_LOCK_WAIT_TIMEOUT)
        waiter_thread.join(timeout=_LOCK_WAIT_TIMEOUT)

        assert not holder_thread.is_alive()
        assert not waiter_thread.is_alive()
        assert not errors, f"スレッド内で例外が発生した: {errors}"
        assert _map_exists(map_a) is False
        assert _map_exists(map_b) is True
        assert _pin_map_id(pin_id) == map_b
        session = TestSessionLocal()
        try:
            assert PinRepository(session).count_photos(pin_id) == 1
        finally:
            session.close()
        assert storage.head(original_key) is not None
        assert thumb_key is not None
        assert storage.head(thumb_key) is not None


class TestMovePinWhileDestinationMapIsBeingDeleted:
    """移動先の地図の削除 × ピンの移動（FK 違反の 500 ではなく 404 になる）。"""

    def test_move_to_deleted_map_is_not_found(self, db_session: Session) -> None:
        storage = FakeObjectStorage(secret="s" * 32)
        owner_id, map_a, map_b, pin_id, _photo = _setup(db_session, storage)

        holder_locked = threading.Event()
        holder_may_commit = threading.Event()
        results: dict[str, object] = {}
        errors: list[BaseException] = []

        def _holder() -> None:
            session = TestSessionLocal()
            try:
                repo = SanpoMapRepository(session)
                repo.lock_owner(owner_id)
                membership = repo.get_membership_for_update(user_id=owner_id, sanpo_map_id=map_b)
                assert membership is not None
                repo.delete(membership[0])
                holder_locked.set()
                holder_may_commit.wait(timeout=_LOCK_WAIT_TIMEOUT)
                session.commit()
            except BaseException as exc:  # noqa: BLE001
                errors.append(exc)
                holder_locked.set()
            finally:
                session.close()

        def _waiter() -> None:
            session = TestSessionLocal()
            try:
                owner = session.get(User, owner_id)
                assert owner is not None
                service = make_pin_service(session, storage)
                try:
                    service.update_pin(
                        owner, pin_id, PinUpdate(sanpo_map_id=map_b), base_url=BASE_URL
                    )
                except SanpoMapNotFoundError:
                    results["not_found"] = True
                else:
                    results["not_found"] = False
            except BaseException as exc:  # noqa: BLE001
                errors.append(exc)
            finally:
                session.close()

        holder_thread = threading.Thread(target=_holder)
        waiter_thread = threading.Thread(target=_waiter)
        holder_thread.start()
        assert holder_locked.wait(timeout=_LOCK_WAIT_TIMEOUT)
        waiter_thread.start()

        assert _wait_for_lock_waiter(), "移動がロック待ちに入らなかった(競合の再現に失敗)"
        assert "not_found" not in results, "移動が地図削除の commit 前に完了した(競合の再現に失敗)"

        holder_may_commit.set()
        holder_thread.join(timeout=_LOCK_WAIT_TIMEOUT)
        waiter_thread.join(timeout=_LOCK_WAIT_TIMEOUT)

        assert not holder_thread.is_alive()
        assert not waiter_thread.is_alive()
        assert not errors, f"スレッド内で例外が発生した: {errors}"
        assert results["not_found"] is True
        assert _map_exists(map_b) is False
        assert _pin_map_id(pin_id) == map_a


class TestSameMapPatchWhileMapIsBeingDeleted:
    """今と同じ地図の ID を送る PATCH × 地図削除（修正前はデッドロックして 500 になっていた）。

    PATCH はピン行を `FOR UPDATE` で握った後、同じ地図行を `FOR KEY SHARE` で取りに行っていた。
    地図削除は地図行 → ピン行の順なので、互いに相手を待って循環した。修正後は同値の PATCH が
    地図行をロックしない。
    """

    def test_does_not_deadlock(self, db_session: Session) -> None:
        storage = FakeObjectStorage(secret="s" * 32)
        owner_id, map_a, _map_b, pin_id, _photo = _setup(db_session, storage)

        patch_locked_pin = threading.Event()
        delete_is_waiting = threading.Event()
        outcomes: dict[str, str] = {}
        errors: list[BaseException] = []

        def _patcher() -> None:
            session = TestSessionLocal()
            try:
                owner = session.get(User, owner_id)
                assert owner is not None
                service = make_pin_service(session, storage)
                original = service._repository.get_for_member_for_update

                def _lock_pin_then_let_delete_start(*args, **kwargs):
                    # ピン行をロックした直後で止まり、地図削除がそのピン行を待つ状態を作ってから
                    # 続きの処理（地図行のロック有無が分かれ目）へ進む。
                    result = original(*args, **kwargs)
                    patch_locked_pin.set()
                    delete_is_waiting.wait(timeout=_LOCK_WAIT_TIMEOUT)
                    return result

                service._repository.get_for_member_for_update = _lock_pin_then_let_delete_start  # type: ignore[method-assign]
                try:
                    service.update_pin(
                        owner, pin_id, PinUpdate(sanpo_map_id=map_a), base_url=BASE_URL
                    )
                except PinNotFoundError:
                    # commit 後に地図削除がピンごと消した場合（競合の正常な結末の1つ）。
                    outcomes["patch"] = "pin_not_found"
                else:
                    outcomes["patch"] = "ok"
            except BaseException as exc:  # noqa: BLE001
                errors.append(exc)
                patch_locked_pin.set()
            finally:
                session.close()

        def _deleter() -> None:
            session = TestSessionLocal()
            try:
                owner = session.get(User, owner_id)
                assert owner is not None
                service = SanpoMapService(
                    session,
                    SanpoMapRepository(session),
                    PhotoObjectCleaner(storage, deadline_seconds=10, call_worst_case_seconds=6),
                )
                service.delete_map(owner, map_a)
                outcomes["delete"] = "ok"
            except BaseException as exc:  # noqa: BLE001
                errors.append(exc)
            finally:
                session.close()

        patcher_thread = threading.Thread(target=_patcher)
        deleter_thread = threading.Thread(target=_deleter)
        patcher_thread.start()
        assert patch_locked_pin.wait(timeout=_LOCK_WAIT_TIMEOUT)
        deleter_thread.start()
        assert _wait_for_lock_waiter(), (
            "地図削除がピン行のロック待ちに入らなかった(競合の再現に失敗)"
        )
        delete_is_waiting.set()

        patcher_thread.join(timeout=_LOCK_WAIT_TIMEOUT)
        deleter_thread.join(timeout=_LOCK_WAIT_TIMEOUT)

        assert not patcher_thread.is_alive()
        assert not deleter_thread.is_alive()
        assert not errors, f"スレッド内で例外が発生した(デッドロックの疑い): {errors}"
        assert outcomes["delete"] == "ok"
        assert outcomes["patch"] in {"ok", "pin_not_found"}
        assert _map_exists(map_a) is False
        assert _pin_map_id(pin_id) is None
