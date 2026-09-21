import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from sanposcape.pins.models import PinPhotoUpload
from sanposcape.pins.photo_attacher import PreparedPhoto
from sanposcape.pins.repository import PinPhotoUploadRepository, PinRepository
from sanposcape.pins.tests.conftest import create_upload_row, make_user
from sanposcape.sanpo_maps.models import SanpoMapMember
from sanposcape.sanpo_maps.repository import SanpoMapRepository


def make_sanpo_map(db_session: Session, *, owner_user_id: uuid.UUID) -> uuid.UUID:
    sanpo_map, _ = SanpoMapRepository(db_session).create_with_owner(
        owner_user_id=owner_user_id, name="テスト地図", is_default=True
    )
    db_session.commit()
    return sanpo_map.id


class TestPinCreate:
    def test_creates_pin(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=user.id)
        repo = PinRepository(db_session)
        client_pin_id = uuid.uuid4()

        pin, created = repo.create(
            sanpo_map_id=sanpo_map_id,
            created_by_user_id=user.id,
            client_pin_id=client_pin_id,
            name="桜のトンネル",
            memo=None,
            latitude=35.0,
            longitude=139.0,
            client_walk_id=None,
        )
        db_session.commit()

        assert created is True
        assert pin.client_pin_id == client_pin_id
        assert pin.name == "桜のトンネル"

    def test_idempotent_resend_returns_existing(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=user.id)
        repo = PinRepository(db_session)
        client_pin_id = uuid.uuid4()
        first, _ = repo.create(
            sanpo_map_id=sanpo_map_id,
            created_by_user_id=user.id,
            client_pin_id=client_pin_id,
            name="1つ目",
            memo=None,
            latitude=0,
            longitude=0,
            client_walk_id=None,
        )
        db_session.commit()

        second, created = repo.create(
            sanpo_map_id=sanpo_map_id,
            created_by_user_id=user.id,
            client_pin_id=client_pin_id,
            name="2つ目",
            memo=None,
            latitude=1,
            longitude=1,
            client_walk_id=None,
        )

        assert created is False
        assert second.id == first.id
        assert second.name == "1つ目"  # 内容が違っても既存を返す

    def test_get_by_client_pin_id_scoped_to_user(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        repo = PinRepository(db_session)
        client_pin_id = uuid.uuid4()
        repo.create(
            sanpo_map_id=sanpo_map_id,
            created_by_user_id=owner.id,
            client_pin_id=client_pin_id,
            name=None,
            memo=None,
            latitude=0,
            longitude=0,
            client_walk_id=None,
        )
        db_session.commit()

        assert repo.get_by_client_pin_id(user_id=stranger.id, client_pin_id=client_pin_id) is None


class TestGetForMemberForUpdate:
    def test_returns_pin_and_role_for_member(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=user.id)
        repo = PinRepository(db_session)
        pin, _ = repo.create(
            sanpo_map_id=sanpo_map_id,
            created_by_user_id=user.id,
            client_pin_id=uuid.uuid4(),
            name=None,
            memo=None,
            latitude=0,
            longitude=0,
            client_walk_id=None,
        )
        db_session.commit()

        result = repo.get_for_member_for_update(user_id=user.id, pin_id=pin.id)

        assert result == (pin, "owner")

    def test_returns_none_for_non_member(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        repo = PinRepository(db_session)
        pin, _ = repo.create(
            sanpo_map_id=sanpo_map_id,
            created_by_user_id=owner.id,
            client_pin_id=uuid.uuid4(),
            name=None,
            memo=None,
            latitude=0,
            longitude=0,
            client_walk_id=None,
        )
        db_session.commit()

        assert repo.get_for_member_for_update(user_id=stranger.id, pin_id=pin.id) is None

    def test_returns_none_for_missing_pin(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = PinRepository(db_session)
        assert repo.get_for_member_for_update(user_id=user.id, pin_id=uuid.uuid4()) is None


class TestPhotosAndTags:
    def _make_pin(self, db_session: Session, user_id: uuid.UUID) -> uuid.UUID:
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=user_id)
        pin, _ = PinRepository(db_session).create(
            sanpo_map_id=sanpo_map_id,
            created_by_user_id=user_id,
            client_pin_id=uuid.uuid4(),
            name=None,
            memo=None,
            latitude=0,
            longitude=0,
            client_walk_id=None,
        )
        db_session.commit()
        return pin.id

    def test_add_photos_assigns_sequential_positions(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        pin_id = self._make_pin(db_session, user.id)
        repo = PinRepository(db_session)
        prepared = [
            PreparedPhoto(
                upload_id=uuid.uuid4(),
                staging_key=f"staging/pins/{user.id}/{i}.jpg",
                original_key=f"original/pins/{user.id}/{i}.jpg",
                thumbnail_key=f"thumb/pins/{user.id}/{i}/512.jpg",
                content_type="image/jpeg",
                byte_size=100,
                width=10,
                height=10,
                thumbnail_bytes=b"x",
                thumbnail_byte_size=1,
                thumbnail_width=5,
                thumbnail_height=5,
            )
            for i in range(3)
        ]

        photos = repo.add_photos(
            pin_id=pin_id, uploaded_by_user_id=user.id, prepared=prepared, start_position=0
        )
        db_session.commit()

        assert [p.position for p in photos] == [0, 1, 2]
        assert repo.count_photos(pin_id) == 3
        assert repo.next_photo_position(pin_id) == 3

    def test_next_photo_position_is_zero_when_no_photos(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        pin_id = self._make_pin(db_session, user.id)
        assert PinRepository(db_session).next_photo_position(pin_id) == 0

    def test_add_tags_and_list_tags(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        pin_id = self._make_pin(db_session, user.id)
        repo = PinRepository(db_session)

        repo.add_tags(pin_id=pin_id, created_by_user_id=user.id, labels=["桜", "撮影スポット"])
        db_session.commit()

        tags = repo.list_tags(pin_id)
        # 同一トランザクション内の INSERT は created_at (DB の now()) が同値になりうるため、
        # 入力順の保持は保証しない（`list_tags` の docstring 参照）。集合として比較する。
        assert {t.label for t in tags} == {"桜", "撮影スポット"}
        assert all(t.created_by_user_id == user.id for t in tags)

    def test_load_read_model_limits_photos_and_reports_total_count(
        self, db_session: Session
    ) -> None:
        user = make_user(db_session, subject="u1")
        pin_id = self._make_pin(db_session, user.id)
        repo = PinRepository(db_session)
        prepared = [
            PreparedPhoto(
                upload_id=uuid.uuid4(),
                staging_key=f"s{i}",
                original_key=f"o{i}",
                thumbnail_key=f"t{i}",
                content_type="image/jpeg",
                byte_size=100,
                width=10,
                height=10,
                thumbnail_bytes=b"x",
                thumbnail_byte_size=1,
                thumbnail_width=5,
                thumbnail_height=5,
            )
            for i in range(3)
        ]
        repo.add_photos(
            pin_id=pin_id, uploaded_by_user_id=user.id, prepared=prepared, start_position=0
        )
        db_session.commit()

        read_model = repo.load_read_model(pin_id, photos_limit=2)

        assert read_model is not None
        assert len(read_model.photos) == 2
        assert read_model.photo_count == 3

    def test_load_read_model_returns_none_when_missing(self, db_session: Session) -> None:
        assert PinRepository(db_session).load_read_model(uuid.uuid4(), photos_limit=10) is None


class TestPinPhotoUploadRepository:
    def test_acquire_user_lock_does_not_error(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        PinPhotoUploadRepository(db_session).acquire_user_lock(user_id=user.id)
        db_session.commit()

    def test_count_active_pending_excludes_expired_and_other_status(
        self, db_session: Session
    ) -> None:
        user = make_user(db_session, subject="u1")
        now = datetime.now(UTC)
        create_upload_row(
            db_session, user_id=user.id, status="pending", expires_at=now + timedelta(hours=1)
        )
        create_upload_row(
            db_session, user_id=user.id, status="pending", expires_at=now - timedelta(hours=1)
        )
        create_upload_row(
            db_session, user_id=user.id, status="attached", expires_at=now + timedelta(hours=1)
        )

        count = PinPhotoUploadRepository(db_session).count_active_pending(user_id=user.id, now=now)

        assert count == 1

    def test_sum_reserved_bytes_only_counts_active_pending(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        now = datetime.now(UTC)
        create_upload_row(
            db_session,
            user_id=user.id,
            declared_byte_size=100,
            status="pending",
            expires_at=now + timedelta(hours=1),
        )
        create_upload_row(
            db_session,
            user_id=user.id,
            declared_byte_size=999,
            status="pending",
            expires_at=now - timedelta(hours=1),
        )

        total = PinPhotoUploadRepository(db_session).sum_reserved_bytes(user_id=user.id, now=now)

        assert total == 100

    def test_sum_attached_bytes_sums_pin_photos_for_user(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=user.id)
        pin, _ = PinRepository(db_session).create(
            sanpo_map_id=sanpo_map_id,
            created_by_user_id=user.id,
            client_pin_id=uuid.uuid4(),
            name=None,
            memo=None,
            latitude=0,
            longitude=0,
            client_walk_id=None,
        )
        db_session.commit()
        prepared = [
            PreparedPhoto(
                upload_id=uuid.uuid4(),
                staging_key="s",
                original_key="o",
                thumbnail_key="t",
                content_type="image/jpeg",
                byte_size=1000,
                width=10,
                height=10,
                thumbnail_bytes=b"x",
                thumbnail_byte_size=1,
                thumbnail_width=5,
                thumbnail_height=5,
            )
        ]
        PinRepository(db_session).add_photos(
            pin_id=pin.id, uploaded_by_user_id=user.id, prepared=prepared, start_position=0
        )
        db_session.commit()

        total = PinPhotoUploadRepository(db_session).sum_attached_bytes(user_id=user.id)

        assert total == 1000

    def test_create_and_lock_for_attach(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        upload = create_upload_row(db_session, user_id=user.id)

        locked = PinPhotoUploadRepository(db_session).lock_for_attach(
            user_id=user.id, upload_ids=[upload.id]
        )

        assert [u.id for u in locked] == [upload.id]

    def test_lock_for_attach_excludes_other_users_uploads(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        upload = create_upload_row(db_session, user_id=owner.id)

        locked = PinPhotoUploadRepository(db_session).lock_for_attach(
            user_id=stranger.id, upload_ids=[upload.id]
        )

        assert locked == []

    def test_mark_attached_updates_status(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        upload = create_upload_row(db_session, user_id=user.id)
        repo = PinPhotoUploadRepository(db_session)

        repo.mark_attached(upload_ids=[upload.id], attached_at=datetime.now(UTC))
        db_session.commit()

        refreshed = db_session.get(PinPhotoUpload, upload.id)
        assert refreshed is not None
        assert refreshed.status == "attached"
        assert refreshed.attached_at is not None

    def test_find_attachment_returns_pin_and_client_pin_id(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=user.id)
        client_pin_id = uuid.uuid4()
        pin, _ = PinRepository(db_session).create(
            sanpo_map_id=sanpo_map_id,
            created_by_user_id=user.id,
            client_pin_id=client_pin_id,
            name=None,
            memo=None,
            latitude=0,
            longitude=0,
            client_walk_id=None,
        )
        db_session.commit()
        upload_id = uuid.uuid4()
        prepared = [
            PreparedPhoto(
                upload_id=upload_id,
                staging_key="s",
                original_key="o",
                thumbnail_key="t",
                content_type="image/jpeg",
                byte_size=100,
                width=10,
                height=10,
                thumbnail_bytes=b"x",
                thumbnail_byte_size=1,
                thumbnail_width=5,
                thumbnail_height=5,
            )
        ]
        PinRepository(db_session).add_photos(
            pin_id=pin.id, uploaded_by_user_id=user.id, prepared=prepared, start_position=0
        )
        db_session.commit()

        result = PinPhotoUploadRepository(db_session).find_attachment(upload_id=upload_id)

        assert result == (pin.id, client_pin_id)

    def test_find_attachment_returns_none_when_unattached(self, db_session: Session) -> None:
        assert PinPhotoUploadRepository(db_session).find_attachment(upload_id=uuid.uuid4()) is None


def test_sanpo_map_member_role_is_owner_after_map_creation(db_session: Session) -> None:
    """`make_sanpo_map` ヘルパー自体の前提（owner member 行）を固定するための回帰テスト。"""
    user = make_user(db_session, subject="u1")
    sanpo_map_id = make_sanpo_map(db_session, owner_user_id=user.id)
    member = db_session.get(SanpoMapMember, (sanpo_map_id, user.id))
    assert member is not None
    assert member.role == "owner"
