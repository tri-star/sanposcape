"""冪等な再送が真に同時に届いたとき（ロック待ちの末に既に紐付いていた）の
`create_pin`・`add_photos`。

`test_service.py` から移した（SS-258。ファイルの分割は SS-256）。
"""

import threading
import time
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from sanposcape.conftest import TestSessionLocal
from sanposcape.integrations.aws.s3 import (
    FakeObjectStorage,
)
from sanposcape.sanpo_maps.conftest import (
    BASE_URL,
    create_upload_row,
    make_pin_service,
    make_user,
    seed_staging_photo,
)
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.photos.photo_attacher import PreparedPhoto
from sanposcape.sanpo_maps.photos.repository import PinPhotoUploadRepository
from sanposcape.sanpo_maps.pins.repository import PinRepository
from sanposcape.sanpo_maps.pins.schemas import (
    PinCreate,
    PinPhotosAdd,
)
from sanposcape.users.models import User

_LOCK_WAIT_TIMEOUT = 5.0


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
        taken_at=None,
        original_bytes=None,
    )


def _commit_first_request(
    session: Session,
    *,
    user_id: uuid.UUID,
    sanpo_map_id: uuid.UUID,
    client_pin_id: uuid.UUID,
    upload_id: uuid.UUID,
) -> uuid.UUID:
    """1回目のリクエストが検証・サムネイル生成・Copy を終えて、DB に書き込んで commit する
    ところを模す。

    S3 側の中身はこのテストの検証対象ではないため実際には書き込まない。作ったピンの ID を返す。
    """
    pin_repo = PinRepository(session)
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
    PinPhotoUploadRepository(session).mark_attached(
        upload_ids=[upload_id], attached_at=datetime.now(UTC)
    )
    session.commit()
    return pin.id


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
                # 実際の1回目のリクエストが `_prepare_photos` の `lock_for_attach` で
                # 行ロックを取得した状態を再現する（未コミット。行ロックを保持したまま待機）。
                upload_repo.lock_for_attach(user_id=user_id, upload_ids=[upload_id])
                holder_locked.set()
                holder_may_commit.wait(timeout=_LOCK_WAIT_TIMEOUT)
                results["holder_pin_id"] = _commit_first_request(
                    session,
                    user_id=user_id,
                    sanpo_map_id=sanpo_map_id,
                    client_pin_id=client_pin_id,
                    upload_id=upload_id,
                )
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
