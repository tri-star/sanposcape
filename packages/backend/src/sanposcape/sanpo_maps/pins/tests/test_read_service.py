import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from sanposcape.integrations.aws.s3 import (
    FakeObjectStorage,
)
from sanposcape.sanpo_maps.conftest import (
    BASE_URL,
    create_pin_photo_row,
    make_pin_service,
    make_user,
)
from sanposcape.sanpo_maps.exceptions import (
    PinNotFoundError,
    SanpoMapNotFoundError,
)
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.pins.schemas import (
    PinCreate,
    PinListQuery,
)


class TestPinServiceListPins:
    """一覧の主な振る舞い（bbox・q・ページング等）は router テストで確認する。ここでは
    `urls_expire_at` の注入・エラーの委譲だけを確認する。
    """

    def test_urls_expire_at_uses_injected_now(self, db_session: Session) -> None:
        fixed_now = datetime(2026, 1, 1, tzinfo=UTC)
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage, now=lambda: fixed_now)
        pin_read, _ = service.create_pin(
            user,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 0, "longitude": 0}),
            base_url=BASE_URL,
        )
        create_pin_photo_row(
            db_session, storage, pin_id=pin_read.id, uploaded_by_user_id=user.id, position=0
        )

        result = service.list_pins(
            user, PinListQuery(sanpo_map_id=pin_read.sanpo_map.id), base_url=BASE_URL
        )

        assert len(result.items) == 1
        cover_photo = result.items[0].cover_photo
        assert cover_photo is not None
        assert cover_photo.urls_expire_at == fixed_now + timedelta(seconds=3600)

    def test_non_member_sanpo_map_raises_not_found(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        storage = FakeObjectStorage(secret="s" * 32)
        sanpo_map, _ = SanpoMapRepository(db_session).create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.commit()
        service = make_pin_service(db_session, storage)

        with pytest.raises(SanpoMapNotFoundError):
            service.list_pins(stranger, PinListQuery(sanpo_map_id=sanpo_map.id), base_url=BASE_URL)


class TestPinServiceGetPin:
    def test_urls_expire_at_uses_injected_now(self, db_session: Session) -> None:
        fixed_now = datetime(2026, 1, 1, tzinfo=UTC)
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage, now=lambda: fixed_now)
        pin_read, _ = service.create_pin(
            user,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 0, "longitude": 0}),
            base_url=BASE_URL,
        )
        create_pin_photo_row(
            db_session, storage, pin_id=pin_read.id, uploaded_by_user_id=user.id, position=0
        )

        result = service.get_pin(user, pin_read.id, base_url=BASE_URL)

        assert result.photos[0].urls_expire_at == fixed_now + timedelta(seconds=3600)

    def test_non_member_pin_raises_not_found(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        pin_read, _ = service.create_pin(
            owner,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 0, "longitude": 0}),
            base_url=BASE_URL,
        )

        with pytest.raises(PinNotFoundError):
            service.get_pin(stranger, pin_read.id, base_url=BASE_URL)


class TestPinServiceListPinPhotos:
    def test_urls_expire_at_uses_injected_now(self, db_session: Session) -> None:
        fixed_now = datetime(2026, 1, 1, tzinfo=UTC)
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage, now=lambda: fixed_now)
        pin_read, _ = service.create_pin(
            user,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 0, "longitude": 0}),
            base_url=BASE_URL,
        )
        create_pin_photo_row(
            db_session, storage, pin_id=pin_read.id, uploaded_by_user_id=user.id, position=0
        )

        result = service.list_pin_photos(
            user, pin_read.id, limit=30, cursor=None, base_url=BASE_URL
        )

        assert result.photo_count == 1
        assert result.items[0].urls_expire_at == fixed_now + timedelta(seconds=3600)

    def test_non_member_pin_raises_not_found(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_pin_service(db_session, storage)
        pin_read, _ = service.create_pin(
            owner,
            PinCreate(client_pin_id=uuid.uuid4(), location={"latitude": 0, "longitude": 0}),
            base_url=BASE_URL,
        )

        with pytest.raises(PinNotFoundError):
            service.list_pin_photos(stranger, pin_read.id, limit=30, cursor=None, base_url=BASE_URL)
