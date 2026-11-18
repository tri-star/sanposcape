import logging
import uuid

import pytest
from sqlalchemy.orm import Session

from sanposcape.integrations.aws.s3 import (
    FakeObjectStorage,
)
from sanposcape.sanpo_maps.conftest import (
    BASE_URL,
    add_map_member,
    create_pin_photo_row,
    make_pin_service,
    make_sanpo_map,
    make_user,
)
from sanposcape.sanpo_maps.exceptions import (
    SanpoMapPermissionDeniedError,
)
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.pins.schemas import (
    PinCreate,
    PinUpdate,
)
from sanposcape.sanpo_maps.pins.service import PinService
from sanposcape.users.models import User


class TestPinServiceMovePin:
    """`update_pin` の地図の移動（ADR-009 決定33, SS-175）。"""

    @staticmethod
    def _maps(db_session: Session, owner: User) -> tuple[uuid.UUID, uuid.UUID]:
        map_a = make_sanpo_map(db_session, owner_user_id=owner.id)
        map_b, _ = SanpoMapRepository(db_session).create_with_owner(
            owner_user_id=owner.id, name="移動先", is_default=False
        )
        db_session.commit()
        return map_a, map_b.id

    @staticmethod
    def _make_pin(service: PinService, user: User, sanpo_map_id: uuid.UUID) -> uuid.UUID:
        pin_read, _ = service.create_pin(
            user,
            PinCreate(
                client_pin_id=uuid.uuid4(),
                sanpo_map_id=sanpo_map_id,
                location={"latitude": 1.5, "longitude": 2.5},
                name="ピン",
                tags=["公園"],
            ),
            base_url=BASE_URL,
        )
        return pin_read.id

    def test_move_keeps_everything_but_the_map(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        map_a, map_b = self._maps(db_session, owner)
        pin_id = self._make_pin(service, owner, map_a)
        photo = create_pin_photo_row(
            db_session, storage, pin_id=pin_id, uploaded_by_user_id=owner.id, position=0
        )
        service.update_pin(owner, pin_id, PinUpdate(visited=True, archived=True), base_url=BASE_URL)
        before = service.get_pin(owner, pin_id, base_url=BASE_URL)

        after = service.update_pin(owner, pin_id, PinUpdate(sanpo_map_id=map_b), base_url=BASE_URL)

        assert after.sanpo_map.id == map_b
        assert after.client_pin_id == before.client_pin_id
        assert after.created_by_user_id == before.created_by_user_id
        assert after.client_walk_id == before.client_walk_id
        assert after.location == before.location
        assert after.visited is True and after.archived is True
        assert after.tags == before.tags
        assert after.created_at == before.created_at
        assert after.updated_at > before.updated_at
        assert [p.id for p in after.photos] == [photo.id]
        # S3 は触らない（キーが地図に依存しないので原本・サムネイルがそのまま残る）。
        assert storage.head(photo.s3_key) is not None
        assert photo.thumbnail_s3_key is not None
        assert storage.head(photo.thumbnail_s3_key) is not None

    def test_move_touches_destination_map_only(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        service = make_pin_service(db_session, FakeObjectStorage(secret="s" * 32))
        map_a, map_b = self._maps(db_session, owner)
        pin_id = self._make_pin(service, owner, map_a)
        repo = SanpoMapRepository(db_session)

        def _updated_at(map_id: uuid.UUID):
            db_session.expire_all()
            membership = repo.get_membership(user_id=owner.id, sanpo_map_id=map_id)
            assert membership is not None
            return membership[0].updated_at

        a_before, b_before = _updated_at(map_a), _updated_at(map_b)

        service.update_pin(owner, pin_id, PinUpdate(sanpo_map_id=map_b), base_url=BASE_URL)

        assert _updated_at(map_a) == a_before
        assert _updated_at(map_b) > b_before

    def test_same_map_does_not_touch_anything(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        service = make_pin_service(db_session, FakeObjectStorage(secret="s" * 32))
        map_a, _map_b = self._maps(db_session, owner)
        pin_id = self._make_pin(service, owner, map_a)
        before = service.get_pin(owner, pin_id, base_url=BASE_URL)
        repo = SanpoMapRepository(db_session)
        membership = repo.get_membership(user_id=owner.id, sanpo_map_id=map_a)
        assert membership is not None
        map_updated_before = membership[0].updated_at

        after = service.update_pin(owner, pin_id, PinUpdate(sanpo_map_id=map_a), base_url=BASE_URL)

        assert after.updated_at == before.updated_at
        db_session.expire_all()
        membership = repo.get_membership(user_id=owner.id, sanpo_map_id=map_a)
        assert membership is not None
        assert membership[0].updated_at == map_updated_before

    def test_same_map_still_checks_permission(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        service = make_pin_service(db_session, FakeObjectStorage(secret="s" * 32))
        map_a, _map_b = self._maps(db_session, owner)
        add_map_member(db_session, sanpo_map_id=map_a, user_id=editor.id, role="editor")
        pin_id = self._make_pin(service, owner, map_a)

        with pytest.raises(SanpoMapPermissionDeniedError):
            service.update_pin(editor, pin_id, PinUpdate(sanpo_map_id=map_a), base_url=BASE_URL)

    def test_logs_move(self, db_session: Session, caplog: pytest.LogCaptureFixture) -> None:
        owner = make_user(db_session, subject="owner")
        service = make_pin_service(db_session, FakeObjectStorage(secret="s" * 32))
        map_a, map_b = self._maps(db_session, owner)
        pin_id = self._make_pin(service, owner, map_a)

        with caplog.at_level(logging.INFO):
            service.update_pin(owner, pin_id, PinUpdate(sanpo_map_id=map_b), base_url=BASE_URL)

        messages = [r.getMessage() for r in caplog.records]
        assert (
            f"Pin moved: pin_id={pin_id} from_sanpo_map_id={map_a} "
            f"to_sanpo_map_id={map_b} by user_id={owner.id}"
        ) in messages
