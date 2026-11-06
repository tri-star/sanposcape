"""アカウント削除のときの共有地図のデータの扱い（SS-251 / ADR-009 決定40）。

`users` の `AccountDeletionService` を実物で組み立て、利用者の行の CASCADE と合わせた結果を
別セッション（`TestSessionLocal`）から確かめる。
"""

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from sanposcape.auth.tests.conftest import FakeAppleSignInClient
from sanposcape.conftest import TestSessionLocal
from sanposcape.integrations.aws.s3 import FakeObjectStorage
from sanposcape.sanpo_maps.conftest import (
    add_pin_tag,
    create_pin_photo_row,
    create_pin_with_tags,
    make_sanpo_map,
    make_user,
)
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.models import Pin, PinPhoto, PinTag, SanpoMap
from sanposcape.sanpo_maps.photos.account_purge import AccountPhotoPurgeScheduler
from sanposcape.sanpo_maps.photos.cleanup import PhotoObjectCleaner
from sanposcape.sanpo_maps.pins.account_deletion import SanpoMapAccountDeletion
from sanposcape.sanpo_maps.pins.account_deletion_repository import AccountDeletionRepository
from sanposcape.users.models import User
from sanposcape.users.repository import AppleAuthorizationRepository, UserRepository
from sanposcape.users.service import AccountDeletionService, UserService


class SpyPhotoCleaner(PhotoObjectCleaner):
    """渡された締め切りを記録する（実際の削除は親に任せる）。"""

    def __init__(self, storage: FakeObjectStorage) -> None:
        super().__init__(storage, deadline_seconds=10, call_worst_case_seconds=6)
        self.deadlines: list[float | None] = []
        self.keys: list[list[str]] = []

    def delete_best_effort(self, keys: list[str], *, deadline_seconds: float | None = None) -> None:
        self.deadlines.append(deadline_seconds)
        self.keys.append(list(keys))
        super().delete_best_effort(keys, deadline_seconds=deadline_seconds)


def _deletion_service(
    db_session: Session,
    storage: FakeObjectStorage,
    *,
    monotonic=None,
    apple_client: FakeAppleSignInClient | None = None,
) -> tuple[AccountDeletionService, SpyPhotoCleaner]:
    cleaner = SpyPhotoCleaner(storage)
    sanpo_map_data = SanpoMapAccountDeletion(
        AccountDeletionRepository(db_session),
        cleaner,
        request_time_budget_seconds=25,
        call_worst_case_seconds=6,
    )
    extra = {} if monotonic is None else {"monotonic": monotonic}
    service = AccountDeletionService(
        db_session,
        UserService(db_session, UserRepository(db_session)),
        AppleAuthorizationRepository(db_session),
        apple_client or FakeAppleSignInClient(),
        AccountPhotoPurgeScheduler(db_session, retention_days=30),
        sanpo_map_data,
        **extra,
    )
    return service, cleaner


def _add_editor(db_session: Session, *, sanpo_map_id: uuid.UUID, user_id: uuid.UUID) -> None:
    SanpoMapRepository(db_session).add_member(
        sanpo_map_id=sanpo_map_id, user_id=user_id, role="editor"
    )
    db_session.commit()


def _delete(db_session: Session, service: AccountDeletionService, user: User) -> None:
    service.delete_account(db_session.get(User, user.id))


@pytest.fixture
def storage() -> FakeObjectStorage:
    return FakeObjectStorage(secret="s" * 32)


class TestEditorAccountDeletion:
    def test_pins_and_tags_stay_on_the_map_and_are_handed_over_to_the_owner(
        self, db_session: Session, storage: FakeObjectStorage
    ) -> None:
        """editor の削除: 本人のピン・タグは地図に残り作成者が owner になる。本人の写真の行は
        消え、owner が付けた写真・タグは残る。"""
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        _add_editor(db_session, sanpo_map_id=map_id, user_id=editor.id)
        pin_id = create_pin_with_tags(
            db_session, sanpo_map_id=map_id, user_id=editor.id, tags=[("本人のタグ", 0)]
        )
        add_pin_tag(db_session, pin_id=pin_id, user_id=owner.id, label="owner のタグ", minutes=1)
        db_session.commit()
        editor_photo = create_pin_photo_row(
            db_session, storage, pin_id=pin_id, uploaded_by_user_id=editor.id, position=0
        )
        owner_photo = create_pin_photo_row(
            db_session, storage, pin_id=pin_id, uploaded_by_user_id=owner.id, position=1
        )
        editor_photo_key = editor_photo.s3_key
        owner_photo_id = owner_photo.id
        owner_photo_key = owner_photo.s3_key
        service, _ = _deletion_service(db_session, storage)

        _delete(db_session, service, editor)

        with TestSessionLocal() as other:
            pin = other.get(Pin, pin_id)
            assert pin is not None
            assert pin.created_by_user_id == owner.id
            tags = other.scalars(select(PinTag).where(PinTag.pin_id == pin_id)).all()
            assert sorted(t.label for t in tags) == ["owner のタグ", "本人のタグ"]
            assert {t.created_by_user_id for t in tags} == {owner.id}
            photos = other.scalars(select(PinPhoto).where(PinPhoto.pin_id == pin_id)).all()
            assert [p.id for p in photos] == [owner_photo_id]
        # 本人の写真の実体は保持期間の後に prefix ごと消す（決定36）ので、ここでは残る。
        assert storage.head(editor_photo_key) is not None
        assert storage.head(owner_photo_key) is not None

    def test_pins_left_on_a_map_after_leaving_are_also_handed_over(
        self, db_session: Session, storage: FakeObjectStorage
    ) -> None:
        """抜けた後（メンバーでない）に残したピンも、owner に付け替えて残す。"""
        owner = make_user(db_session, subject="owner")
        former = make_user(db_session, subject="former")
        map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        pin_id = create_pin_with_tags(db_session, sanpo_map_id=map_id, user_id=former.id)
        service, _ = _deletion_service(db_session, storage)

        _delete(db_session, service, former)

        with TestSessionLocal() as other:
            pin = other.get(Pin, pin_id)
            assert pin is not None
            assert pin.created_by_user_id == owner.id

    def test_owner_pin_with_the_same_client_pin_id_does_not_block_the_deletion(
        self, db_session: Session, storage: FakeObjectStorage
    ) -> None:
        """owner が editor のピンと同じ `client_pin_id` のピンを持っていても（応答で見えるので
        わざと作れる）、一意制約で削除が失敗し続けない。付け替えたピンの `client_pin_id` だけを
        振り直し、owner のピンは変えない。"""
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        shared_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        _add_editor(db_session, sanpo_map_id=shared_map_id, user_id=editor.id)
        editor_pin_id = create_pin_with_tags(
            db_session, sanpo_map_id=shared_map_id, user_id=editor.id
        )
        owner_pin_id = create_pin_with_tags(
            db_session, sanpo_map_id=shared_map_id, user_id=owner.id
        )
        copied = db_session.get(Pin, editor_pin_id).client_pin_id
        db_session.get(Pin, owner_pin_id).client_pin_id = copied
        db_session.commit()
        service, _ = _deletion_service(db_session, storage)

        _delete(db_session, service, editor)

        with TestSessionLocal() as other:
            assert other.get(User, editor.id) is None
            handed_over = other.get(Pin, editor_pin_id)
            assert handed_over.created_by_user_id == owner.id
            assert handed_over.client_pin_id != copied
            assert other.get(Pin, owner_pin_id).client_pin_id == copied

    def test_client_pin_id_is_kept_when_it_does_not_collide(
        self, db_session: Session, storage: FakeObjectStorage
    ) -> None:
        """衝突しないピンの `client_pin_id` は変えない。"""
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        _add_editor(db_session, sanpo_map_id=map_id, user_id=editor.id)
        pin_id = create_pin_with_tags(db_session, sanpo_map_id=map_id, user_id=editor.id)
        client_pin_id = db_session.get(Pin, pin_id).client_pin_id
        service, _ = _deletion_service(db_session, storage)

        _delete(db_session, service, editor)

        with TestSessionLocal() as other:
            assert other.get(Pin, pin_id).client_pin_id == client_pin_id

    def test_does_not_touch_other_users_pins_or_updated_at(
        self, db_session: Session, storage: FakeObjectStorage
    ) -> None:
        """付け替えるのは本人のピンだけで、`updated_at` は動かさない。"""
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        bystander = make_user(db_session, subject="bystander")
        map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        _add_editor(db_session, sanpo_map_id=map_id, user_id=editor.id)
        _add_editor(db_session, sanpo_map_id=map_id, user_id=bystander.id)
        editor_pin_id = create_pin_with_tags(db_session, sanpo_map_id=map_id, user_id=editor.id)
        bystander_pin_id = create_pin_with_tags(
            db_session, sanpo_map_id=map_id, user_id=bystander.id, tags=[("他人のタグ", 0)]
        )
        updated_at_before = db_session.get(Pin, editor_pin_id).updated_at
        service, _ = _deletion_service(db_session, storage)

        _delete(db_session, service, editor)

        with TestSessionLocal() as other:
            assert other.get(Pin, editor_pin_id).updated_at == updated_at_before
            assert other.get(Pin, bystander_pin_id).created_by_user_id == bystander.id
            tag = other.scalars(select(PinTag).where(PinTag.pin_id == bystander_pin_id)).one()
            assert tag.created_by_user_id == bystander.id


class TestOwnerAccountDeletion:
    def test_map_is_deleted_and_other_members_photo_objects_are_deleted(
        self, db_session: Session, storage: FakeObjectStorage
    ) -> None:
        """owner の削除: 地図ごと消え、ほかのメンバーの写真の実体を commit の後に消す。
        本人の写真の実体は保持期間のため残す。"""
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        _add_editor(db_session, sanpo_map_id=map_id, user_id=editor.id)
        pin_id = create_pin_with_tags(db_session, sanpo_map_id=map_id, user_id=editor.id)
        editor_photo = create_pin_photo_row(
            db_session, storage, pin_id=pin_id, uploaded_by_user_id=editor.id, position=0
        )
        owner_photo = create_pin_photo_row(
            db_session, storage, pin_id=pin_id, uploaded_by_user_id=owner.id, position=1
        )
        editor_keys = [editor_photo.s3_key, editor_photo.thumbnail_s3_key]
        owner_keys = [owner_photo.s3_key, owner_photo.thumbnail_s3_key]
        service, _ = _deletion_service(db_session, storage)

        _delete(db_session, service, owner)

        with TestSessionLocal() as other:
            assert other.get(SanpoMap, map_id) is None
            assert other.get(Pin, pin_id) is None
            assert other.get(User, editor.id) is not None
        assert [storage.head(k) for k in editor_keys] == [None, None]
        assert all(storage.head(k) is not None for k in owner_keys)

    def test_editor_deletion_keeps_owner_photo_objects_and_deletes_nothing_immediately(
        self, db_session: Session, storage: FakeObjectStorage
    ) -> None:
        """editor の削除では S3 を即時には消さない（本人の写真は保持期間の後。付け替えた
        ピンに owner が付けた写真の実体は残る）。"""
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        _add_editor(db_session, sanpo_map_id=map_id, user_id=editor.id)
        pin_id = create_pin_with_tags(db_session, sanpo_map_id=map_id, user_id=editor.id)
        owner_photo = create_pin_photo_row(
            db_session, storage, pin_id=pin_id, uploaded_by_user_id=owner.id, position=0
        )
        owner_photo_key = owner_photo.s3_key
        service, cleaner = _deletion_service(db_session, storage)

        _delete(db_session, service, editor)

        assert storage.head(owner_photo_key) is not None
        assert cleaner.keys == [[]]  # 即時に消すキーは無い


class TestCleanupDeadline:
    def test_cleanup_deadline_shrinks_by_the_time_already_spent(
        self, db_session: Session, storage: FakeObjectStorage
    ) -> None:
        """締め切りは「時間予算 25 秒 − 経過時間 − 1回の最悪時間 6 秒」（Apple の失効で
        時間を使った後でも、後始末を含めて時間予算に収める）。"""
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        _add_editor(db_session, sanpo_map_id=map_id, user_id=editor.id)
        pin_id = create_pin_with_tags(db_session, sanpo_map_id=map_id, user_id=editor.id)
        create_pin_photo_row(
            db_session, storage, pin_id=pin_id, uploaded_by_user_id=editor.id, position=0
        )
        clock = iter([100.0, 112.0])  # 開始と commit の後。12 秒かかった
        service, cleaner = _deletion_service(db_session, storage, monotonic=lambda: next(clock))

        _delete(db_session, service, owner)

        assert cleaner.deadlines == [25 - 12 - 6]

    def test_apple_revocation_time_is_subtracted_from_the_cleanup_deadline(
        self, db_session: Session, storage: FakeObjectStorage
    ) -> None:
        """Apple ユーザーは失効（外部 HTTP）にかかった時間だけ締め切りが縮む。経過時間は
        失効の前から測る。"""
        owner = User(
            provider="apple",
            provider_subject="apple-owner",
            email=None,
            display_name=None,
            photo_url=None,
        )
        db_session.add(owner)
        db_session.commit()
        AppleAuthorizationRepository(db_session).upsert(
            owner.id, client_id="com.sanposcape.app.dev", refresh_token="refresh"
        )
        editor = make_user(db_session, subject="editor")
        map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        _add_editor(db_session, sanpo_map_id=map_id, user_id=editor.id)
        pin_id = create_pin_with_tags(db_session, sanpo_map_id=map_id, user_id=editor.id)
        create_pin_photo_row(
            db_session, storage, pin_id=pin_id, uploaded_by_user_id=editor.id, position=0
        )
        now = [100.0]

        def slow_revoke() -> None:
            now[0] += 14.0  # 失効に 14 秒かかった

        apple_client = FakeAppleSignInClient(on_revoke=slow_revoke)
        service, cleaner = _deletion_service(
            db_session, storage, monotonic=lambda: now[0], apple_client=apple_client
        )

        _delete(db_session, service, owner)

        assert len(apple_client.revoke_calls) == 1
        assert cleaner.deadlines == [25 - 14 - 6]
