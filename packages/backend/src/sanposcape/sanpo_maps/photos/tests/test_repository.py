import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from sanposcape.sanpo_maps.conftest import create_upload_row, make_sanpo_map, make_user
from sanposcape.sanpo_maps.models import PinPhotoUpload
from sanposcape.sanpo_maps.photos.photo_attacher import PreparedPhoto
from sanposcape.sanpo_maps.photos.repository import PinPhotoUploadRepository
from sanposcape.sanpo_maps.pins.repository import PinRepository


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
                taken_at=None,
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

    def test_create_stores_taken_at(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        taken_at = datetime(2026, 7, 2, 0, 14, 5, tzinfo=UTC)

        upload = PinPhotoUploadRepository(db_session).create(
            upload_id=uuid.uuid4(),
            user_id=user.id,
            s3_key="staging/k",
            content_type="image/jpeg",
            declared_byte_size=10,
            expires_at=datetime.now(UTC) + timedelta(hours=1),
            taken_at=taken_at,
        )

        assert upload.taken_at == taken_at

    def test_mark_attached_clears_taken_at_only_for_targets(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        taken_at = datetime(2026, 7, 2, 0, 14, 5, tzinfo=UTC)
        target = create_upload_row(db_session, user_id=user.id, taken_at=taken_at)
        other = create_upload_row(db_session, user_id=user.id, taken_at=taken_at)

        PinPhotoUploadRepository(db_session).mark_attached(
            upload_ids=[target.id], attached_at=datetime.now(UTC)
        )
        db_session.commit()

        db_session.expire_all()
        assert db_session.get(PinPhotoUpload, target.id).taken_at is None  # type: ignore[union-attr]
        assert db_session.get(PinPhotoUpload, other.id).taken_at == taken_at  # type: ignore[union-attr]

    def test_find_attachments_returns_pin_and_client_pin_id(self, db_session: Session) -> None:
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
                taken_at=None,
            )
        ]
        PinRepository(db_session).add_photos(
            pin_id=pin.id, uploaded_by_user_id=user.id, prepared=prepared, start_position=0
        )
        db_session.commit()

        result = PinPhotoUploadRepository(db_session).find_attachments(
            user_id=user.id, upload_ids=[upload_id]
        )

        assert result == {upload_id: (pin.id, client_pin_id)}

    def test_find_attachments_returns_empty_dict_when_unattached(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        assert (
            PinPhotoUploadRepository(db_session).find_attachments(
                user_id=user.id, upload_ids=[uuid.uuid4()]
            )
            == {}
        )

    def test_find_attachments_returns_empty_dict_for_empty_input(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        assert (
            PinPhotoUploadRepository(db_session).find_attachments(user_id=user.id, upload_ids=[])
            == {}
        )

    def test_find_attachments_excludes_other_users_uploads(self, db_session: Session) -> None:
        """アップロード者本人（`uploaded_by_user_id`）以外からは紐付け状況を解決できない
        （IDOR 対策。他のリポジトリメソッドと同じ `user_id` 必須の規約, R8）。"""
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        client_pin_id = uuid.uuid4()
        pin, _ = PinRepository(db_session).create(
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
                taken_at=None,
            )
        ]
        PinRepository(db_session).add_photos(
            pin_id=pin.id, uploaded_by_user_id=owner.id, prepared=prepared, start_position=0
        )
        db_session.commit()

        result = PinPhotoUploadRepository(db_session).find_attachments(
            user_id=stranger.id, upload_ids=[upload_id]
        )

        assert result == {}
