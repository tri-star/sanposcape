import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import update
from sqlalchemy.orm import Session

from sanposcape.core.pagination import encode_cursor
from sanposcape.pins.models import Pin, PinPhotoUpload
from sanposcape.pins.photo_attacher import PreparedPhoto
from sanposcape.pins.repository import (
    NOT_PROVIDED,
    PinBoundingBox,
    PinPhotoUploadRepository,
    PinRepository,
)
from sanposcape.pins.tests.conftest import create_pin_photo_row, create_upload_row, make_user
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


def test_sanpo_map_member_role_is_owner_after_map_creation(db_session: Session) -> None:
    """`make_sanpo_map` ヘルパー自体の前提（owner member 行）を固定するための回帰テスト。"""
    user = make_user(db_session, subject="u1")
    sanpo_map_id = make_sanpo_map(db_session, owner_user_id=user.id)
    member = db_session.get(SanpoMapMember, (sanpo_map_id, user.id))
    assert member is not None
    assert member.role == "owner"


class TestGetForMember:
    def test_returns_pin_and_role_for_member(self, db_session: Session) -> None:
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

        assert PinRepository(db_session).get_for_member(user_id=user.id, pin_id=pin.id) == (
            pin,
            "owner",
        )

    def test_returns_none_for_non_member(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        pin, _ = PinRepository(db_session).create(
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

        assert PinRepository(db_session).get_for_member(user_id=stranger.id, pin_id=pin.id) is None

    def test_returns_none_for_missing_pin(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        assert (
            PinRepository(db_session).get_for_member(user_id=user.id, pin_id=uuid.uuid4()) is None
        )

    def test_returns_editor_role_for_invited_member(self, db_session: Session) -> None:
        """招待された editor（member 行を直接 INSERT）でも role が正しく返る。"""
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        db_session.add(SanpoMapMember(sanpo_map_id=sanpo_map_id, user_id=editor.id, role="editor"))
        db_session.commit()
        pin, _ = PinRepository(db_session).create(
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

        result = PinRepository(db_session).get_for_member(user_id=editor.id, pin_id=pin.id)

        assert result is not None
        assert result[1] == "editor"


class TestListForMember:
    def _make_pin(
        self,
        db_session: Session,
        *,
        sanpo_map_id: uuid.UUID,
        user_id: uuid.UUID,
        latitude: float = 0,
        longitude: float = 0,
        name: str | None = None,
        memo: str | None = None,
    ) -> Pin:
        pin, _ = PinRepository(db_session).create(
            sanpo_map_id=sanpo_map_id,
            created_by_user_id=user_id,
            client_pin_id=uuid.uuid4(),
            name=name,
            memo=memo,
            latitude=latitude,
            longitude=longitude,
            client_walk_id=None,
        )
        db_session.commit()
        return pin

    def test_excludes_pins_of_maps_the_user_is_not_a_member_of(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        self._make_pin(db_session, sanpo_map_id=sanpo_map_id, user_id=owner.id)

        rows = PinRepository(db_session).list_for_member(
            user_id=stranger.id,
            sanpo_map_id=sanpo_map_id,
            bbox=None,
            q=None,
            tag_keys=[],
            limit=50,
            cursor=None,
        )

        assert rows == []

    def test_bbox_includes_boundary_and_excludes_outside(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=user.id)
        inside = self._make_pin(
            db_session, sanpo_map_id=sanpo_map_id, user_id=user.id, latitude=1, longitude=1
        )
        on_boundary = self._make_pin(
            db_session, sanpo_map_id=sanpo_map_id, user_id=user.id, latitude=0, longitude=0
        )
        outside = self._make_pin(
            db_session, sanpo_map_id=sanpo_map_id, user_id=user.id, latitude=10, longitude=10
        )

        rows = PinRepository(db_session).list_for_member(
            user_id=user.id,
            sanpo_map_id=sanpo_map_id,
            bbox=PinBoundingBox(min_latitude=0, min_longitude=0, max_latitude=1, max_longitude=1),
            q=None,
            tag_keys=[],
            limit=50,
            cursor=None,
        )

        ids = {pin.id for pin in rows}
        assert ids == {inside.id, on_boundary.id}
        assert outside.id not in ids

    def test_q_matches_name_memo_or_tag_case_insensitively(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=user.id)
        repo = PinRepository(db_session)
        by_name = self._make_pin(
            db_session, sanpo_map_id=sanpo_map_id, user_id=user.id, name="Sakura Tunnel"
        )
        by_memo = self._make_pin(
            db_session, sanpo_map_id=sanpo_map_id, user_id=user.id, memo="visit in SAKURA season"
        )
        by_tag = self._make_pin(db_session, sanpo_map_id=sanpo_map_id, user_id=user.id)
        repo.add_tags(pin_id=by_tag.id, created_by_user_id=user.id, labels=["さくら"])
        no_match = self._make_pin(
            db_session, sanpo_map_id=sanpo_map_id, user_id=user.id, name="Unrelated"
        )
        db_session.commit()

        rows = repo.list_for_member(
            user_id=user.id,
            sanpo_map_id=sanpo_map_id,
            bbox=None,
            q="sakura",
            tag_keys=[],
            limit=50,
            cursor=None,
        )

        ids = {pin.id for pin in rows}
        assert ids == {by_name.id, by_memo.id}
        assert by_tag.id not in ids  # "sakura" は "さくら" に一致しない
        assert no_match.id not in ids

    def test_q_treats_percent_and_underscore_as_literals(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=user.id)
        repo = PinRepository(db_session)
        literal_percent = self._make_pin(
            db_session, sanpo_map_id=sanpo_map_id, user_id=user.id, name="100% off"
        )
        unrelated = self._make_pin(
            db_session, sanpo_map_id=sanpo_map_id, user_id=user.id, name="1000 steps"
        )
        db_session.commit()

        rows = repo.list_for_member(
            user_id=user.id,
            sanpo_map_id=sanpo_map_id,
            bbox=None,
            q="100%",
            tag_keys=[],
            limit=50,
            cursor=None,
        )

        ids = {pin.id for pin in rows}
        assert ids == {literal_percent.id}
        assert unrelated.id not in ids

    def test_tags_filter_requires_all_tags_present(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=user.id)
        repo = PinRepository(db_session)
        both = self._make_pin(db_session, sanpo_map_id=sanpo_map_id, user_id=user.id)
        repo.add_tags(pin_id=both.id, created_by_user_id=user.id, labels=["桜", "撮影スポット"])
        only_one = self._make_pin(db_session, sanpo_map_id=sanpo_map_id, user_id=user.id)
        repo.add_tags(pin_id=only_one.id, created_by_user_id=user.id, labels=["桜"])
        db_session.commit()

        rows = repo.list_for_member(
            user_id=user.id,
            sanpo_map_id=sanpo_map_id,
            bbox=None,
            q=None,
            tag_keys=["桜", "撮影スポット"],
            limit=50,
            cursor=None,
        )

        assert [pin.id for pin in rows] == [both.id]

    def test_orders_by_created_at_desc_id_desc_and_paginates_without_gaps_or_duplicates(
        self, db_session: Session
    ) -> None:
        user = make_user(db_session, subject="u1")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=user.id)
        repo = PinRepository(db_session)
        pins = [
            self._make_pin(db_session, sanpo_map_id=sanpo_map_id, user_id=user.id) for _ in range(3)
        ]
        # 同一トランザクションで作成した場合、created_at が同値になりうる状況を明示的に作る
        # （テストの前提を固定するコメント通り、id を副ソートキーにしてもページングが壊れない
        # ことを確認する）。
        same_time = datetime(2026, 1, 1, tzinfo=UTC)
        db_session.execute(
            update(Pin).where(Pin.id.in_([p.id for p in pins])).values(created_at=same_time)
        )
        db_session.commit()

        first_page = repo.list_for_member(
            user_id=user.id,
            sanpo_map_id=sanpo_map_id,
            bbox=None,
            q=None,
            tag_keys=[],
            limit=2,
            cursor=None,
        )
        assert len(first_page) == 3  # limit + 1 件取得
        # created_at が全件同値のため、順序は id DESC（副ソートキー）だけで決まる。
        assert [pin.id for pin in first_page] == sorted((p.id for p in pins), reverse=True)

        page = first_page[:2]
        cursor = encode_cursor(page[-1].created_at, page[-1].id)
        from sanposcape.core.pagination import decode_cursor

        second_page = repo.list_for_member(
            user_id=user.id,
            sanpo_map_id=sanpo_map_id,
            bbox=None,
            q=None,
            tag_keys=[],
            limit=2,
            cursor=decode_cursor(cursor),
        )

        all_ids = [pin.id for pin in page] + [pin.id for pin in second_page]
        assert len(all_ids) == len(set(all_ids)) == 3
        assert set(all_ids) == {p.id for p in pins}


class TestGetCoverPhotosAndCounts:
    def _make_pin(self, db_session: Session, *, user_id: uuid.UUID) -> uuid.UUID:
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

    def test_get_cover_photos_returns_lowest_position_and_omits_pins_without_photos(
        self, db_session: Session
    ) -> None:
        user = make_user(db_session, subject="u1")
        with_photos = self._make_pin(db_session, user_id=user.id)
        without_photos = self._make_pin(db_session, user_id=user.id)
        create_pin_photo_row(
            db_session, None, pin_id=with_photos, uploaded_by_user_id=user.id, position=1
        )
        cover = create_pin_photo_row(
            db_session, None, pin_id=with_photos, uploaded_by_user_id=user.id, position=0
        )

        result = PinRepository(db_session).get_cover_photos([with_photos, without_photos])

        assert result[with_photos].id == cover.id
        assert without_photos not in result

    def test_count_photos_for_pins_sums_per_pin_and_omits_zero(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        pin_a = self._make_pin(db_session, user_id=user.id)
        pin_b = self._make_pin(db_session, user_id=user.id)
        create_pin_photo_row(
            db_session, None, pin_id=pin_a, uploaded_by_user_id=user.id, position=0
        )
        create_pin_photo_row(
            db_session, None, pin_id=pin_a, uploaded_by_user_id=user.id, position=1
        )

        result = PinRepository(db_session).count_photos_for_pins([pin_a, pin_b])

        assert result[pin_a] == 2
        assert pin_b not in result

    def test_list_tags_for_pins_groups_by_pin(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = PinRepository(db_session)
        pin_a = self._make_pin(db_session, user_id=user.id)
        pin_b = self._make_pin(db_session, user_id=user.id)
        repo.add_tags(pin_id=pin_a, created_by_user_id=user.id, labels=["桜"])
        db_session.commit()

        result = repo.list_tags_for_pins([pin_a, pin_b])

        assert {tag.label for tag in result[pin_a]} == {"桜"}
        assert pin_b not in result

    def test_empty_pin_ids_returns_empty_dict_without_querying(self, db_session: Session) -> None:
        repo = PinRepository(db_session)
        assert repo.get_cover_photos([]) == {}
        assert repo.count_photos_for_pins([]) == {}
        assert repo.list_tags_for_pins([]) == {}


class TestListPhotosPage:
    def _make_pin(self, db_session: Session, *, user_id: uuid.UUID) -> uuid.UUID:
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

    def test_paginates_through_all_photos_without_gaps_or_duplicates(
        self, db_session: Session
    ) -> None:
        user = make_user(db_session, subject="u1")
        pin_id = self._make_pin(db_session, user_id=user.id)
        photos = [
            create_pin_photo_row(
                db_session, None, pin_id=pin_id, uploaded_by_user_id=user.id, position=i
            )
            for i in range(5)
        ]
        repo = PinRepository(db_session)

        collected: list[uuid.UUID] = []
        cursor: tuple[int, uuid.UUID] | None = None
        for _ in range(10):  # 十分な反復回数（無限ループ防止）
            page = repo.list_photos_page(pin_id=pin_id, limit=2, cursor=cursor)
            has_more = len(page) > 2
            items = page[:2]
            collected.extend(item.id for item in items)
            if not has_more:
                break
            last = items[-1]
            cursor = (last.position, last.id)

        assert collected == [photo.id for photo in photos]


class TestUpdateFields:
    def _make_pin(self, db_session: Session, *, user_id: uuid.UUID) -> Pin:
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=user_id)
        pin, _ = PinRepository(db_session).create(
            sanpo_map_id=sanpo_map_id,
            created_by_user_id=user_id,
            client_pin_id=uuid.uuid4(),
            name="元の名前",
            memo="元のメモ",
            latitude=0,
            longitude=0,
            client_walk_id=None,
        )
        db_session.commit()
        return pin

    def test_updates_only_provided_fields(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        pin = self._make_pin(db_session, user_id=user.id)
        repo = PinRepository(db_session)
        new_updated_at = datetime(2026, 1, 1, tzinfo=UTC)

        repo.update_fields(pin, name="新しい名前", updated_at=new_updated_at)
        db_session.commit()

        assert pin.name == "新しい名前"
        assert pin.memo == "元のメモ"  # 送られなかったフィールドは変わらない
        assert pin.updated_at == new_updated_at

    def test_not_provided_sentinel_leaves_field_unchanged_even_for_none(
        self, db_session: Session
    ) -> None:
        """`NOT_PROVIDED`（省略）と明示的な `None`（消す）は区別される。"""
        user = make_user(db_session, subject="u1")
        pin = self._make_pin(db_session, user_id=user.id)
        repo = PinRepository(db_session)

        repo.update_fields(pin, memo=None, updated_at=datetime.now(UTC))
        db_session.commit()

        assert pin.name == "元の名前"  # NOT_PROVIDED のまま = 変わらない
        assert pin.memo is None  # 明示的な None = 消える

    def test_not_provided_default_is_used_when_omitted(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        pin = self._make_pin(db_session, user_id=user.id)
        repo = PinRepository(db_session)

        repo.update_fields(pin, updated_at=datetime.now(UTC))
        db_session.commit()

        assert pin.name == "元の名前"
        assert pin.memo == "元のメモ"
        assert NOT_PROVIDED is not None


class TestGetTagsByIds:
    def _make_pin(self, db_session: Session, *, user_id: uuid.UUID) -> uuid.UUID:
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

    def test_scoped_to_pin_id(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = PinRepository(db_session)
        pin_a = self._make_pin(db_session, user_id=user.id)
        pin_b = self._make_pin(db_session, user_id=user.id)
        [tag_a] = repo.add_tags(pin_id=pin_a, created_by_user_id=user.id, labels=["桜"])
        [tag_b] = repo.add_tags(pin_id=pin_b, created_by_user_id=user.id, labels=["紅葉"])
        db_session.commit()

        result = repo.get_tags_by_ids(pin_id=pin_a, tag_ids=[tag_a.id, tag_b.id])

        assert {tag.id for tag in result} == {tag_a.id}

    def test_empty_tag_ids_returns_empty_without_querying(self, db_session: Session) -> None:
        repo = PinRepository(db_session)
        assert repo.get_tags_by_ids(pin_id=uuid.uuid4(), tag_ids=[]) == []


class TestDeleteTagsAndCountTags:
    def _make_pin(self, db_session: Session, *, user_id: uuid.UUID) -> uuid.UUID:
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

    def test_delete_tags_removes_rows(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = PinRepository(db_session)
        pin_id = self._make_pin(db_session, user_id=user.id)
        tags = repo.add_tags(pin_id=pin_id, created_by_user_id=user.id, labels=["桜", "紅葉"])
        db_session.commit()
        assert repo.count_tags(pin_id) == 2

        repo.delete_tags([tags[0]])
        db_session.commit()

        assert repo.count_tags(pin_id) == 1
        remaining = repo.list_tags(pin_id)
        assert {tag.label for tag in remaining} == {"紅葉"}

    def test_count_tags_zero_when_none(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = PinRepository(db_session)
        pin_id = self._make_pin(db_session, user_id=user.id)
        assert repo.count_tags(pin_id) == 0


class TestGetPhotoForPin:
    def _make_pin(self, db_session: Session, *, user_id: uuid.UUID) -> uuid.UUID:
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

    def test_scoped_to_pin_id(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        pin_a = self._make_pin(db_session, user_id=user.id)
        pin_b = self._make_pin(db_session, user_id=user.id)
        photo = create_pin_photo_row(
            db_session, None, pin_id=pin_a, uploaded_by_user_id=user.id, position=0
        )
        repo = PinRepository(db_session)

        assert repo.get_photo_for_pin(pin_id=pin_a, photo_id=photo.id) is not None
        assert repo.get_photo_for_pin(pin_id=pin_b, photo_id=photo.id) is None

    def test_missing_photo_id_returns_none(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        pin_id = self._make_pin(db_session, user_id=user.id)
        repo = PinRepository(db_session)
        assert repo.get_photo_for_pin(pin_id=pin_id, photo_id=uuid.uuid4()) is None


class TestListPhotoKeysDeletePhotoDeletePin:
    def _make_pin(self, db_session: Session, *, user_id: uuid.UUID) -> Pin:
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
        return pin

    def test_list_photo_keys_includes_photos_without_thumbnail(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        pin = self._make_pin(db_session, user_id=user.id)
        with_thumb = create_pin_photo_row(
            db_session, None, pin_id=pin.id, uploaded_by_user_id=user.id, position=0
        )
        without_thumb = create_pin_photo_row(
            db_session,
            None,
            pin_id=pin.id,
            uploaded_by_user_id=user.id,
            position=1,
            with_thumbnail=False,
        )
        repo = PinRepository(db_session)

        keys = repo.list_photo_keys(pin.id)

        assert (with_thumb.s3_key, with_thumb.thumbnail_s3_key) in keys
        assert (without_thumb.s3_key, None) in keys

    def test_delete_photo_removes_row(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        pin = self._make_pin(db_session, user_id=user.id)
        photo = create_pin_photo_row(
            db_session, None, pin_id=pin.id, uploaded_by_user_id=user.id, position=0
        )
        repo = PinRepository(db_session)

        repo.delete_photo(photo)
        db_session.commit()

        assert repo.get_photo_for_pin(pin_id=pin.id, photo_id=photo.id) is None

    def test_delete_pin_cascades_photos_and_tags(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        pin = self._make_pin(db_session, user_id=user.id)
        repo = PinRepository(db_session)
        create_pin_photo_row(
            db_session, None, pin_id=pin.id, uploaded_by_user_id=user.id, position=0
        )
        repo.add_tags(pin_id=pin.id, created_by_user_id=user.id, labels=["桜"])
        db_session.commit()

        repo.delete_pin(pin)
        db_session.commit()

        assert db_session.get(Pin, pin.id) is None
        assert repo.count_photos(pin.id) == 0
        assert repo.count_tags(pin.id) == 0
