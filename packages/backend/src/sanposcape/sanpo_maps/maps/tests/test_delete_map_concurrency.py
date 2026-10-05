"""地図削除とピンの移動の並行実行（ADR-009 決定33, SS-175）。

`threading.Thread` + 別 `Session`（= 別コネクション）で実 DB 上の真の競合を再現する
（`pins/tests/test_service.py::TestCreatePinTrueConcurrentIdempotentResend` と同じ手法）。
固定するのは次の2点。デッドロックしないことの網羅はテストせず、ADR-009 決定33 の分析で担保する。

- 移動中（未 commit）のピンがある地図を削除しても、移動先で生き残るピンの写真は S3 から消えない
- 移動先の地図が同時に削除されたら、移動は 500 ではなく `SanpoMapNotFoundError`（404）になる
"""

import threading
import time
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from sanposcape.conftest import TestSessionLocal
from sanposcape.integrations.aws.s3 import FakeObjectStorage
from sanposcape.sanpo_maps.conftest import create_pin_photo_row, make_user
from sanposcape.sanpo_maps.exceptions import SanpoMapNotFoundError
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.maps.service import SanpoMapService
from sanposcape.sanpo_maps.models import Pin, SanpoMap
from sanposcape.sanpo_maps.photos.cleanup import PhotoObjectCleaner
from sanposcape.sanpo_maps.pins.repository import PinRepository
from sanposcape.sanpo_maps.pins.schemas import PinUpdate
from sanposcape.sanpo_maps.pins.tests.test_service import BASE_URL, make_pin_service
from sanposcape.users.models import User

_LOCK_WAIT_TIMEOUT = 5.0


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

        time.sleep(0.3)
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

        time.sleep(0.3)
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
