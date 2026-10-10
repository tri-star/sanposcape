import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import insert, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from sanposcape.sanpo_maps.conftest import (
    TAG_BASE_TIME,
    add_pin_tag,
    create_pin_photo_row,
    create_pin_with_tags,
    make_sanpo_map,
    make_user,
)
from sanposcape.sanpo_maps.maps.repository import _PROMOTE_MAX_ATTEMPTS, SanpoMapRepository
from sanposcape.sanpo_maps.models import SanpoMap, SanpoMapIcon, SanpoMapMember
from sanposcape.sanpo_maps.pins.repository import PinRepository
from sanposcape.users.models import User


class TestListForMember:
    def test_own_default_map_is_first(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        other_map, _ = repo.create_with_owner(
            owner_user_id=user.id, name="他の地図", is_default=False
        )
        default_map, _ = repo.create_with_owner(
            owner_user_id=user.id, name="最初の地図", is_default=True
        )
        db_session.commit()

        rows = repo.list_for_member(user_id=user.id)

        assert [m.id for m, _role in rows] == [default_map.id, other_map.id]
        assert all(role == "owner" for _m, role in rows)

    def test_orders_non_default_maps_by_updated_at_desc(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        older, _ = repo.create_with_owner(owner_user_id=user.id, name="古い", is_default=False)
        newer, _ = repo.create_with_owner(owner_user_id=user.id, name="新しい", is_default=False)
        db_session.commit()
        repo.touch(sanpo_map_id=older.id, now=datetime.now(UTC) + timedelta(hours=1))
        db_session.commit()

        rows = repo.list_for_member(user_id=user.id)

        assert [m.id for m, _role in rows] == [older.id, newer.id]

    def test_other_users_map_is_not_returned(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        repo = SanpoMapRepository(db_session)
        repo.create_with_owner(owner_user_id=owner.id, name="地図", is_default=True)
        db_session.commit()

        assert repo.list_for_member(user_id=stranger.id) == []

    def test_editor_of_others_default_map_sees_role_editor(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=owner.id, name="地図", is_default=True)
        db_session.add(SanpoMapMember(sanpo_map_id=sanpo_map.id, user_id=editor.id, role="editor"))
        db_session.commit()

        rows = repo.list_for_member(user_id=editor.id)

        assert rows == [(sanpo_map, "editor")]

    def test_no_maps_returns_empty_list(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        assert repo.list_for_member(user_id=user.id) == []


class TestGetMembership:
    def test_returns_map_and_role_for_member(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=user.id, name="地図", is_default=True)
        db_session.commit()

        result = repo.get_membership(user_id=user.id, sanpo_map_id=sanpo_map.id)

        assert result == (sanpo_map, "owner")

    def test_returns_none_for_non_member(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=owner.id, name="地図", is_default=True)
        db_session.commit()

        assert repo.get_membership(user_id=stranger.id, sanpo_map_id=sanpo_map.id) is None


class TestGetDefaultForOwner:
    def test_returns_default_map(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        repo.create_with_owner(owner_user_id=user.id, name="非既定", is_default=False)
        default_map, _ = repo.create_with_owner(owner_user_id=user.id, name="既定", is_default=True)
        db_session.commit()

        assert repo.get_default_for_owner(owner_user_id=user.id) == default_map

    def test_returns_none_when_no_default(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        assert repo.get_default_for_owner(owner_user_id=user.id) is None


class TestCreateWithOwner:
    def test_creates_map_and_owner_member_row(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)

        sanpo_map, created = repo.create_with_owner(
            owner_user_id=user.id, name="最初の地図", is_default=True
        )
        db_session.commit()

        assert created is True
        assert sanpo_map.owner_user_id == user.id
        member = db_session.get(SanpoMapMember, (sanpo_map.id, user.id))
        assert member is not None
        assert member.role == "owner"

    def test_concurrent_default_creation_returns_single_existing_map(
        self, db_session: Session
    ) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        first, first_created = repo.create_with_owner(
            owner_user_id=user.id, name="1つ目", is_default=True
        )
        db_session.commit()

        second, second_created = repo.create_with_owner(
            owner_user_id=user.id, name="2つ目", is_default=True
        )

        assert first_created is True
        assert second_created is False
        assert second.id == first.id
        # 2つ目の地図の INSERT は savepoint ごとロールバックされているため、
        # このユーザーの地図は1件のまま。
        assert len(repo.list_for_member(user_id=user.id)) == 1


class TestIcon:
    def test_create_with_owner_uses_default_icon(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)

        sanpo_map, _ = repo.create_with_owner(
            owner_user_id=user.id, name="最初の地図", is_default=True
        )

        assert sanpo_map.icon == "pin"

    def test_create_owned_saves_given_icon(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)

        sanpo_map = repo.create_owned(
            owner_user_id=user.id, name="地図", prefer_default=False, icon=SanpoMapIcon.COFFEE
        )
        db_session.commit()

        refreshed = db_session.get(SanpoMap, sanpo_map.id)
        assert refreshed is not None
        assert refreshed.icon == "coffee"

    def test_create_owned_without_icon_defaults_to_pin(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)

        sanpo_map = repo.create_owned(owner_user_id=user.id, name="地図", prefer_default=True)

        assert sanpo_map.icon == "pin"

    def test_create_owned_keeps_icon_when_falling_back_to_non_default(
        self, db_session: Session
    ) -> None:
        """既定地図との競合で `is_default=False` に作り直す経路でもアイコンを保つ。"""
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        repo.create_with_owner(owner_user_id=user.id, name="先着の既定", is_default=True)
        db_session.commit()

        second = repo.create_owned(
            owner_user_id=user.id, name="後発", prefer_default=True, icon=SanpoMapIcon.COFFEE
        )
        db_session.commit()

        assert second.is_default is False
        assert second.icon == "coffee"

    def test_update_icon_changes_icon_without_touching_updated_at(
        self, db_session: Session
    ) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=user.id, name="地図", is_default=True)
        db_session.commit()
        original_updated_at = sanpo_map.updated_at

        repo.update_icon(sanpo_map, icon=SanpoMapIcon.CAT)
        db_session.commit()

        refreshed = db_session.get(SanpoMap, sanpo_map.id)
        assert refreshed is not None
        assert refreshed.icon == "cat"
        assert refreshed.updated_at == original_updated_at

    def test_check_constraint_rejects_unknown_icon(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=user.id, name="地図", is_default=True)
        db_session.commit()

        sanpo_map.icon = "unknown"
        with pytest.raises(IntegrityError):
            db_session.flush()
        db_session.rollback()

    def test_server_default_is_pin_when_icon_is_not_specified(self, db_session: Session) -> None:
        """ORM の `default=` を経由しない経路（Core の INSERT）で DB の既定値を確かめる。"""
        user = make_user(db_session, subject="u1")
        map_id = db_session.execute(
            insert(SanpoMap).values(owner_user_id=user.id, name="地図").returning(SanpoMap.id)
        ).scalar_one()

        icon = db_session.scalar(select(SanpoMap.icon).where(SanpoMap.id == map_id))

        assert icon == "pin"


class TestTouch:
    def test_updates_updated_at(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=user.id, name="地図", is_default=True)
        db_session.commit()
        new_time = datetime.now(UTC) + timedelta(days=1)

        repo.touch(sanpo_map_id=sanpo_map.id, now=new_time)
        db_session.commit()

        refreshed = db_session.get(SanpoMap, sanpo_map.id)
        assert refreshed is not None
        assert refreshed.updated_at == new_time


class TestGetMembershipForUpdate:
    def test_returns_map_and_role_for_member(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=user.id, name="地図", is_default=True)
        db_session.commit()

        result = repo.get_membership_for_update(user_id=user.id, sanpo_map_id=sanpo_map.id)

        assert result == (sanpo_map, "owner")

    def test_returns_none_for_non_member(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=owner.id, name="地図", is_default=True)
        db_session.commit()

        assert (
            repo.get_membership_for_update(user_id=stranger.id, sanpo_map_id=sanpo_map.id) is None
        )


class TestGetMembershipForKeyShare:
    def test_returns_map_and_role_for_member(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=user.id, name="地図", is_default=True)
        db_session.commit()

        result = repo.get_membership_for_key_share(user_id=user.id, sanpo_map_id=sanpo_map.id)

        assert result == (sanpo_map, "owner")

    def test_returns_none_for_non_member(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=owner.id, name="地図", is_default=True)
        db_session.commit()

        assert (
            repo.get_membership_for_key_share(user_id=stranger.id, sanpo_map_id=sanpo_map.id)
            is None
        )

    def test_returns_none_for_missing_map(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)

        assert repo.get_membership_for_key_share(user_id=user.id, sanpo_map_id=uuid.uuid4()) is None


class TestLockPinsForMap:
    def test_locks_pins_without_error_and_leaves_them_unchanged(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=user.id, name="地図", is_default=True)
        pin_repo = PinRepository(db_session)
        pins = [
            pin_repo.create(
                sanpo_map_id=sanpo_map.id,
                created_by_user_id=user.id,
                client_pin_id=uuid.uuid4(),
                name=f"P{i}",
                memo=None,
                latitude=0,
                longitude=0,
                client_walk_id=None,
            )[0]
            for i in range(2)
        ]
        db_session.commit()

        repo.lock_pins_for_map(sanpo_map.id)  # 例外を投げない

        assert {p.sanpo_map_id for p in pins} == {sanpo_map.id}

    def test_empty_map_does_not_error(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=user.id, name="地図", is_default=True)
        db_session.commit()

        repo.lock_pins_for_map(sanpo_map.id)

    def test_unknown_map_does_not_error(self, db_session: Session) -> None:
        SanpoMapRepository(db_session).lock_pins_for_map(uuid.uuid4())


class TestCreateOwned:
    def test_prefer_default_true_creates_default_map(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)

        sanpo_map = repo.create_owned(owner_user_id=user.id, name="最初の地図", prefer_default=True)
        db_session.commit()

        assert sanpo_map.is_default is True
        member = db_session.get(SanpoMapMember, (sanpo_map.id, user.id))
        assert member is not None
        assert member.role == "owner"

    def test_prefer_default_false_creates_non_default_map(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        repo.create_with_owner(owner_user_id=user.id, name="既定", is_default=True)
        db_session.commit()

        sanpo_map = repo.create_owned(owner_user_id=user.id, name="2つ目", prefer_default=False)
        db_session.commit()

        assert sanpo_map.is_default is False

    def test_concurrent_default_creation_falls_back_to_non_default(
        self, db_session: Session
    ) -> None:
        """`prefer_default=True` で作成中に別の経路（`POST /pins` の自動作成等）が
        先に既定を作った場合、`create_owned()` は一意違反を savepoint で捕捉し、
        `is_default=False` で新しい地図を作る（既存の既定地図を返すのではなく、新規に
        作る点が `create_with_owner()` と違う）。
        """
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        first, _ = repo.create_with_owner(owner_user_id=user.id, name="先着の既定", is_default=True)
        db_session.commit()

        second = repo.create_owned(owner_user_id=user.id, name="後発", prefer_default=True)
        db_session.commit()

        assert second.id != first.id
        assert second.is_default is False
        rows = repo.list_for_member(user_id=user.id)
        assert len(rows) == 2


class TestUpdateName:
    def test_updates_name_without_touching_updated_at(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=user.id, name="旧名", is_default=True)
        db_session.commit()
        original_updated_at = sanpo_map.updated_at

        repo.update_name(sanpo_map, name="新名")
        db_session.commit()

        refreshed = db_session.get(SanpoMap, sanpo_map.id)
        assert refreshed is not None
        assert refreshed.name == "新名"
        assert refreshed.updated_at == original_updated_at


class TestDelete:
    def test_deletes_map_and_cascades_members(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=user.id, name="地図", is_default=True)
        db_session.commit()
        sanpo_map_id = sanpo_map.id

        repo.delete(sanpo_map)
        db_session.commit()

        assert db_session.get(SanpoMap, sanpo_map_id) is None
        assert db_session.get(SanpoMapMember, (sanpo_map_id, user.id)) is None


class TestPromoteLatestToDefault:
    def test_promotes_most_recently_updated_map(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        older = repo.create_owned(owner_user_id=user.id, name="古い", prefer_default=False)
        repo.create_owned(owner_user_id=user.id, name="新しい", prefer_default=False)
        db_session.commit()
        repo.touch(sanpo_map_id=older.id, now=datetime.now(UTC) + timedelta(hours=1))
        db_session.commit()

        promoted_id = repo.promote_latest_to_default(owner_user_id=user.id)
        db_session.commit()

        assert promoted_id == older.id
        refreshed = db_session.get(SanpoMap, older.id)
        assert refreshed is not None
        assert refreshed.is_default is True

    def test_returns_none_when_no_maps_remain(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)

        assert repo.promote_latest_to_default(owner_user_id=user.id) is None

    def test_does_not_promote_other_users_map(self, db_session: Session) -> None:
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        repo = SanpoMapRepository(db_session)
        repo.create_owned(owner_user_id=owner.id, name="他人の地図", prefer_default=False)
        db_session.commit()

        assert repo.promote_latest_to_default(owner_user_id=stranger.id) is None

    def test_retries_with_next_candidate_when_first_update_matches_zero_rows(
        self, db_session: Session
    ) -> None:
        """PR #103 レビュー対応: 選定直後に候補行が消えた（`UPDATE` の rowcount が0）場合、
        その候補を除いて選び直すことを固定する。真の同時実行は再現せず、
        `_select_promotion_candidate()` を差し替えて「存在しない候補」を1回目に返させる
        （advisory lock を取っていても、将来他経路で消えた場合の防御的分岐を検証する）。
        """
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        fallback = repo.create_owned(owner_user_id=user.id, name="残る地図", prefer_default=False)
        db_session.commit()

        call_count = 0
        original_select = repo._select_promotion_candidate

        def fake_select(*, owner_user_id: uuid.UUID, excluded_ids: list) -> uuid.UUID | None:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return uuid.uuid4()  # 同時に消えたことにする、存在しない候補
            return original_select(owner_user_id=owner_user_id, excluded_ids=excluded_ids)

        repo._select_promotion_candidate = fake_select  # type: ignore[method-assign]

        promoted_id = repo.promote_latest_to_default(owner_user_id=user.id)
        db_session.commit()

        assert call_count == 2
        assert promoted_id == fallback.id
        refreshed = db_session.get(SanpoMap, fallback.id)
        assert refreshed is not None
        assert refreshed.is_default is True

    def test_gives_up_after_max_attempts_when_every_candidate_is_gone(
        self, db_session: Session
    ) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)
        repo.create_owned(owner_user_id=user.id, name="地図", prefer_default=False)
        db_session.commit()

        call_count = 0

        def fake_select(*, owner_user_id: uuid.UUID, excluded_ids: list) -> uuid.UUID | None:
            nonlocal call_count
            call_count += 1
            return uuid.uuid4()  # 毎回「存在しない候補」を返す

        repo._select_promotion_candidate = fake_select  # type: ignore[method-assign]

        promoted_id = repo.promote_latest_to_default(owner_user_id=user.id)

        assert promoted_id is None
        assert call_count == _PROMOTE_MAX_ATTEMPTS


class TestLockOwner:
    def test_does_not_error(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        repo = SanpoMapRepository(db_session)

        repo.lock_owner(user.id)  # 例外を投げない


class TestListPhotoKeysForMap:
    def test_includes_all_pins_photos_in_the_map(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=user.id)
        repo = SanpoMapRepository(db_session)
        pin_repo = PinRepository(db_session)
        pin_a, _ = pin_repo.create(
            sanpo_map_id=sanpo_map_id,
            created_by_user_id=user.id,
            client_pin_id=uuid.uuid4(),
            name=None,
            memo=None,
            latitude=0,
            longitude=0,
            client_walk_id=None,
        )
        pin_b, _ = pin_repo.create(
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
        photo_a = create_pin_photo_row(
            db_session, None, pin_id=pin_a.id, uploaded_by_user_id=user.id, position=0
        )
        photo_b = create_pin_photo_row(
            db_session,
            None,
            pin_id=pin_b.id,
            uploaded_by_user_id=user.id,
            position=0,
            with_thumbnail=False,
        )

        keys = repo.list_photo_keys_for_map(sanpo_map_id)

        assert (photo_a.s3_key, photo_a.thumbnail_s3_key) in keys
        assert (photo_b.s3_key, None) in keys

    def test_excludes_photos_from_other_maps(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        target_map_id = make_sanpo_map(db_session, owner_user_id=user.id)
        # `make_sanpo_map()` は is_default=True で作るため、同じユーザーで2回呼ぶと
        # 一意違反のフォールバックで同じ地図が返ってしまう。2つ目は非既定で直接作る。
        repo = SanpoMapRepository(db_session)
        other_map, _ = repo.create_with_owner(
            owner_user_id=user.id, name="別の地図", is_default=False
        )
        db_session.commit()
        other_map_id = other_map.id
        pin_repo = PinRepository(db_session)
        target_pin, _ = pin_repo.create(
            sanpo_map_id=target_map_id,
            created_by_user_id=user.id,
            client_pin_id=uuid.uuid4(),
            name=None,
            memo=None,
            latitude=0,
            longitude=0,
            client_walk_id=None,
        )
        other_pin, _ = pin_repo.create(
            sanpo_map_id=other_map_id,
            created_by_user_id=user.id,
            client_pin_id=uuid.uuid4(),
            name=None,
            memo=None,
            latitude=0,
            longitude=0,
            client_walk_id=None,
        )
        db_session.commit()
        create_pin_photo_row(
            db_session, None, pin_id=target_pin.id, uploaded_by_user_id=user.id, position=0
        )
        other_photo = create_pin_photo_row(
            db_session, None, pin_id=other_pin.id, uploaded_by_user_id=user.id, position=0
        )

        keys = repo.list_photo_keys_for_map(target_map_id)

        assert (other_photo.s3_key, other_photo.thumbnail_s3_key) not in keys

    def test_empty_map_returns_empty_list(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=user.id)
        repo = SanpoMapRepository(db_session)

        assert repo.list_photo_keys_for_map(sanpo_map_id) == []


class TestCountPinsForMaps:
    def test_counts_pins_per_map_and_omits_empty_maps(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        map_with_pins = make_sanpo_map(db_session, owner_user_id=user.id)
        # `make_sanpo_map()` は is_default=True で作るため、同じユーザーで2回呼ぶと
        # 一意違反のフォールバックで同じ地図が返ってしまう。2つ目は非既定で直接作る。
        repo = SanpoMapRepository(db_session)
        map_without_pins_row, _ = repo.create_with_owner(
            owner_user_id=user.id, name="ピンなし地図", is_default=False
        )
        db_session.commit()
        map_without_pins = map_without_pins_row.id
        pin_repo = PinRepository(db_session)
        pin_repo.create(
            sanpo_map_id=map_with_pins,
            created_by_user_id=user.id,
            client_pin_id=uuid.uuid4(),
            name=None,
            memo=None,
            latitude=0,
            longitude=0,
            client_walk_id=None,
        )
        pin_repo.create(
            sanpo_map_id=map_with_pins,
            created_by_user_id=user.id,
            client_pin_id=uuid.uuid4(),
            name=None,
            memo=None,
            latitude=0,
            longitude=0,
            client_walk_id=None,
        )
        db_session.commit()

        counts = repo.count_pins_for_maps([map_with_pins, map_without_pins])

        assert counts == {map_with_pins: 2}
        assert map_without_pins not in counts

    def test_empty_input_returns_empty_dict(self, db_session: Session) -> None:
        repo = SanpoMapRepository(db_session)
        assert repo.count_pins_for_maps([]) == {}


class TestListTagSummaries:
    def _setup(self, db_session: Session) -> tuple[User, uuid.UUID, SanpoMapRepository]:
        owner = make_user(db_session, subject="owner")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        return owner, sanpo_map_id, SanpoMapRepository(db_session)

    def test_aggregates_by_label_key_ordered_by_pin_count(self, db_session: Session) -> None:
        owner, map_id, repo = self._setup(db_session)
        for _ in range(3):
            create_pin_with_tags(
                db_session, sanpo_map_id=map_id, user_id=owner.id, tags=[("カフェ", 0)]
            )
        create_pin_with_tags(db_session, sanpo_map_id=map_id, user_id=owner.id, tags=[("公園", 10)])

        rows = repo.list_tag_summaries(user_id=owner.id, sanpo_map_id=map_id, limit=100)

        assert [(r.label, r.pin_count) for r in rows] == [("カフェ", 3), ("公園", 1)]

    def test_representative_label_is_the_latest_one(self, db_session: Session) -> None:
        owner, map_id, repo = self._setup(db_session)
        create_pin_with_tags(db_session, sanpo_map_id=map_id, user_id=owner.id, tags=[("Cafe", 0)])
        create_pin_with_tags(db_session, sanpo_map_id=map_id, user_id=owner.id, tags=[("cafe", 5)])

        rows = repo.list_tag_summaries(user_id=owner.id, sanpo_map_id=map_id, limit=100)

        assert len(rows) == 1
        assert rows[0].label == "cafe"
        assert rows[0].label_key == "cafe"
        assert rows[0].pin_count == 2

    def test_representative_label_is_the_latest_even_if_inserted_first(
        self, db_session: Session
    ) -> None:
        """INSERT 順ではなく `created_at` で決まる（添字ずれ・順序不定の検知）。"""
        owner, map_id, repo = self._setup(db_session)
        create_pin_with_tags(db_session, sanpo_map_id=map_id, user_id=owner.id, tags=[("cafe", 5)])
        create_pin_with_tags(db_session, sanpo_map_id=map_id, user_id=owner.id, tags=[("Cafe", 0)])

        rows = repo.list_tag_summaries(user_id=owner.id, sanpo_map_id=map_id, limit=100)

        assert [r.label for r in rows] == ["cafe"]

    def test_same_created_at_falls_back_to_larger_tag_id(self, db_session: Session) -> None:
        owner, map_id, repo = self._setup(db_session)
        small_id = uuid.UUID("00000000-0000-0000-0000-000000000001")
        large_id = uuid.UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")
        pin_a = create_pin_with_tags(db_session, sanpo_map_id=map_id, user_id=owner.id)
        pin_b = create_pin_with_tags(db_session, sanpo_map_id=map_id, user_id=owner.id)
        add_pin_tag(db_session, pin_id=pin_a, user_id=owner.id, label="Cafe", tag_id=large_id)
        add_pin_tag(db_session, pin_id=pin_b, user_id=owner.id, label="cafe", tag_id=small_id)
        db_session.commit()

        rows = repo.list_tag_summaries(user_id=owner.id, sanpo_map_id=map_id, limit=100)

        assert [r.label for r in rows] == ["Cafe"]

    def test_same_pin_count_orders_by_last_used_at_desc(self, db_session: Session) -> None:
        owner, map_id, repo = self._setup(db_session)
        create_pin_with_tags(db_session, sanpo_map_id=map_id, user_id=owner.id, tags=[("古い", 0)])
        create_pin_with_tags(
            db_session, sanpo_map_id=map_id, user_id=owner.id, tags=[("新しい", 10)]
        )

        rows = repo.list_tag_summaries(user_id=owner.id, sanpo_map_id=map_id, limit=100)

        assert [r.label for r in rows] == ["新しい", "古い"]

    def test_same_pin_count_and_last_used_at_orders_by_label_key_asc(
        self, db_session: Session
    ) -> None:
        owner, map_id, repo = self._setup(db_session)
        create_pin_with_tags(
            db_session,
            sanpo_map_id=map_id,
            user_id=owner.id,
            tags=[("b", 0), ("c", 0), ("a", 0)],
        )

        rows = repo.list_tag_summaries(user_id=owner.id, sanpo_map_id=map_id, limit=100)

        assert [r.label_key for r in rows] == ["a", "b", "c"]

    def test_tie_break_by_label_key_is_byte_order(self, db_session: Session) -> None:
        """最終タイブレークは DB の collation ではなくバイト順（`COLLATE "C"`）。"""
        owner, map_id, repo = self._setup(db_session)
        create_pin_with_tags(
            db_session,
            sanpo_map_id=map_id,
            user_id=owner.id,
            tags=[("あ", 0), ("z", 0), ("_x", 0), ("1", 0), ("Y", 0)],
        )

        rows = repo.list_tag_summaries(user_id=owner.id, sanpo_map_id=map_id, limit=100)

        # 数字 < `_` < 小文字 ASCII < かな（UTF-8 のバイト順）。`Y` は "y" に正規化される。
        assert [r.label_key for r in rows] == ["1", "_x", "y", "z", "あ"]

    def test_limit_truncates_to_top_n(self, db_session: Session) -> None:
        owner, map_id, repo = self._setup(db_session)
        for label, count in (("a", 3), ("b", 2), ("c", 1)):
            for _ in range(count):
                create_pin_with_tags(
                    db_session, sanpo_map_id=map_id, user_id=owner.id, tags=[(label, 0)]
                )

        rows = repo.list_tag_summaries(user_id=owner.id, sanpo_map_id=map_id, limit=2)

        assert [r.label for r in rows] == ["a", "b"]

    def test_other_maps_tags_are_excluded(self, db_session: Session) -> None:
        owner, map_id, repo = self._setup(db_session)
        other_map, _ = repo.create_with_owner(
            owner_user_id=owner.id, name="別の地図", is_default=False
        )
        db_session.commit()
        create_pin_with_tags(
            db_session, sanpo_map_id=map_id, user_id=owner.id, tags=[("自分の地図", 0)]
        )
        create_pin_with_tags(
            db_session, sanpo_map_id=other_map.id, user_id=owner.id, tags=[("別の地図", 0)]
        )

        rows = repo.list_tag_summaries(user_id=owner.id, sanpo_map_id=map_id, limit=100)

        assert [r.label for r in rows] == ["自分の地図"]

    def test_non_member_gets_empty_list(self, db_session: Session) -> None:
        owner, map_id, repo = self._setup(db_session)
        stranger = make_user(db_session, subject="stranger")
        create_pin_with_tags(
            db_session, sanpo_map_id=map_id, user_id=owner.id, tags=[("カフェ", 0)]
        )

        assert repo.list_tag_summaries(user_id=stranger.id, sanpo_map_id=map_id, limit=100) == []

    def test_editor_sees_tags_created_by_owner(self, db_session: Session) -> None:
        owner, map_id, repo = self._setup(db_session)
        editor = make_user(db_session, subject="editor")
        db_session.add(SanpoMapMember(sanpo_map_id=map_id, user_id=editor.id, role="editor"))
        db_session.commit()
        create_pin_with_tags(
            db_session, sanpo_map_id=map_id, user_id=owner.id, tags=[("オーナーのタグ", 0)]
        )
        create_pin_with_tags(
            db_session, sanpo_map_id=map_id, user_id=editor.id, tags=[("編集者のタグ", 1)]
        )

        rows = repo.list_tag_summaries(user_id=editor.id, sanpo_map_id=map_id, limit=100)

        assert {r.label for r in rows} == {"オーナーのタグ", "編集者のタグ"}

    def test_map_without_tags_returns_empty_list(self, db_session: Session) -> None:
        owner, map_id, repo = self._setup(db_session)
        create_pin_with_tags(db_session, sanpo_map_id=map_id, user_id=owner.id)

        assert repo.list_tag_summaries(user_id=owner.id, sanpo_map_id=map_id, limit=100) == []

    def test_last_used_at_is_max_created_at_per_key(self, db_session: Session) -> None:
        owner, map_id, repo = self._setup(db_session)
        create_pin_with_tags(
            db_session, sanpo_map_id=map_id, user_id=owner.id, tags=[("a", 3), ("b", 1)]
        )
        create_pin_with_tags(db_session, sanpo_map_id=map_id, user_id=owner.id, tags=[("a", 7)])

        rows = {
            r.label_key: r
            for r in repo.list_tag_summaries(user_id=owner.id, sanpo_map_id=map_id, limit=100)
        }

        assert rows["a"].last_used_at == TAG_BASE_TIME + timedelta(minutes=7)
        assert rows["b"].last_used_at == TAG_BASE_TIME + timedelta(minutes=1)
