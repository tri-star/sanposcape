"""地図の削除（`DELETE /sanpo-maps/{id}`）と `?expand=pin_count` の、pins 側との結合テスト
（ADR-009 決定28・決定29）。

`sanpo_maps` は `pins` を import しないが、逆方向（`pins → sanpo_maps`）は許容される
（folder-structure.md）。ピン・写真・タグを持つ地図を実際に作る必要があるテストは、
依存の向きに合わせて `pins/tests/` 側に置く（`sanpo_maps/tests/test_router.py` は
`pins` を import しない）。
"""

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from sanposcape.auth.tokens import create_access_token
from sanposcape.config import Settings
from sanposcape.conftest import TestSessionLocal
from sanposcape.integrations.aws.s3 import FakeObjectStorage
from sanposcape.pins.photo_keys import staging_key
from sanposcape.pins.repository import PinPhotoUploadRepository, PinRepository
from sanposcape.pins.tests.conftest import (
    create_pin_photo_row,
    create_upload_row,
    make_user,
    seed_staging_photo,
)
from sanposcape.sanpo_maps.models import SanpoMap, SanpoMapMember
from sanposcape.sanpo_maps.repository import SanpoMapRepository
from sanposcape.users.models import User

_FAKE_STORAGE_SETTINGS = Settings(
    env="test",
    auth_mode="real",
    auth_jwt_secret="x" * 32,
    google_allowed_audiences=["test-audience"],
    storage_mode="fake",
)


def _auth_headers_for(user: User) -> dict[str, str]:
    """`fake_storage_client` の JWT シークレットと揃えた設定でトークンを発行する
    （`pins/tests/test_router.py::_auth_headers_for` と同じ流儀）。
    """
    token, _ = create_access_token(user_id=user.id, settings=_FAKE_STORAGE_SETTINGS)
    return {"Authorization": f"Bearer {token}"}


def _sanpo_map_exists(sanpo_map_id: uuid.UUID) -> bool:
    """HTTP 経由の削除は別セッション（override_get_db）で commit されるため、新しい
    セッションで確認する（呼び出し元の `db_session` は identity map に古い状態を
    持ちうる。`Session.get()` は identity map にあれば DB へ問い合わせないうえ、
    `expire_all()` 後に消えた行を `get()` すると `ObjectDeletedError` になり
    `None` を返さない）。
    """
    session = TestSessionLocal()
    try:
        return session.get(SanpoMap, sanpo_map_id) is not None
    finally:
        session.close()


def _make_pin_with_photo(
    db_session: Session,
    storage: FakeObjectStorage,
    *,
    sanpo_map_id: uuid.UUID,
    user_id: uuid.UUID,
) -> tuple[uuid.UUID, tuple[str, str]]:
    """地図に、写真・タグ付きのピンを1件作る。戻り値は `(pin_id, (s3_key, thumbnail_s3_key))`。"""
    pin, _created = PinRepository(db_session).create(
        sanpo_map_id=sanpo_map_id,
        created_by_user_id=user_id,
        client_pin_id=uuid.uuid4(),
        name="ピン",
        memo=None,
        latitude=0,
        longitude=0,
        client_walk_id=None,
    )
    db_session.commit()
    PinRepository(db_session).add_tags(pin_id=pin.id, created_by_user_id=user_id, labels=["タグ"])
    db_session.commit()
    photo = create_pin_photo_row(
        db_session, storage, pin_id=pin.id, uploaded_by_user_id=user_id, position=0
    )
    assert photo.thumbnail_s3_key is not None
    return pin.id, (photo.s3_key, photo.thumbnail_s3_key)


class TestDeleteSanpoMapCascade:
    def test_deletes_pins_photos_tags_and_members(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        db_session: Session,
    ) -> None:
        client, storage = fake_storage_client
        owner = make_user(db_session, subject="owner")
        sanpo_map, _ = SanpoMapRepository(db_session).create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.commit()
        pin_id, _keys = _make_pin_with_photo(
            db_session, storage, sanpo_map_id=sanpo_map.id, user_id=owner.id
        )

        response = client.delete(f"/sanpo-maps/{sanpo_map.id}", headers=_auth_headers_for(owner))

        assert response.status_code == 204
        assert _sanpo_map_exists(sanpo_map.id) is False
        fresh_session = TestSessionLocal()
        try:
            assert fresh_session.get(SanpoMapMember, (sanpo_map.id, owner.id)) is None
            fresh_repo = PinRepository(fresh_session)
            assert fresh_repo.load_read_model(pin_id, photos_limit=10) is None
            assert fresh_repo.count_photos(pin_id) == 0
            assert fresh_repo.count_tags(pin_id) == 0
        finally:
            fresh_session.close()

    def test_deletes_s3_objects_and_leaves_other_maps_photos_intact(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        db_session: Session,
    ) -> None:
        client, storage = fake_storage_client
        owner = make_user(db_session, subject="owner")
        repo = SanpoMapRepository(db_session)
        deleted_map, _ = repo.create_with_owner(
            owner_user_id=owner.id, name="消す地図", is_default=True
        )
        surviving_map, _ = repo.create_with_owner(
            owner_user_id=owner.id, name="残す地図", is_default=False
        )
        db_session.commit()
        _pin_id, (deleted_key, deleted_thumb_key) = _make_pin_with_photo(
            db_session, storage, sanpo_map_id=deleted_map.id, user_id=owner.id
        )
        _other_pin_id, (surviving_key, surviving_thumb_key) = _make_pin_with_photo(
            db_session, storage, sanpo_map_id=surviving_map.id, user_id=owner.id
        )

        response = client.delete(f"/sanpo-maps/{deleted_map.id}", headers=_auth_headers_for(owner))

        assert response.status_code == 204
        assert storage.head(deleted_key) is None
        assert storage.head(deleted_thumb_key) is None
        assert storage.head(surviving_key) is not None
        assert storage.head(surviving_thumb_key) is not None

    def test_pending_staging_upload_survives_and_can_be_attached_to_another_map(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        db_session: Session,
    ) -> None:
        """SS-117 の「写真を先にアップロード → 地図を作成 → 保存」が地図削除の影響を
        受けないことの確認（決定28: staging は触らない）。
        """
        client, storage = fake_storage_client
        owner = make_user(db_session, subject="owner")
        sanpo_map, _ = SanpoMapRepository(db_session).create_with_owner(
            owner_user_id=owner.id, name="消す地図", is_default=True
        )
        db_session.commit()
        upload = create_upload_row(db_session, user_id=owner.id)
        seed_staging_photo(storage, user_id=owner.id, upload_id=upload.id)
        headers = _auth_headers_for(owner)

        delete_response = client.delete(f"/sanpo-maps/{sanpo_map.id}", headers=headers)
        assert delete_response.status_code == 204
        assert storage.head(staging_key(user_id=owner.id, upload_id=upload.id)) is not None

        create_map_response = client.post(
            "/sanpo-maps", json={"name": "新しい地図"}, headers=headers
        )
        assert create_map_response.status_code == 201
        new_map_id = create_map_response.json()["id"]

        create_pin_response = client.post(
            "/pins",
            headers=headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "sanpo_map_id": new_map_id,
                "location": {"latitude": 0, "longitude": 0},
                "photo_upload_ids": [str(upload.id)],
            },
        )

        assert create_pin_response.status_code == 201
        assert create_pin_response.json()["photo_count"] == 1

    def test_capacity_is_freed_after_deletion(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        db_session: Session,
    ) -> None:
        client, storage = fake_storage_client
        owner = make_user(db_session, subject="owner")
        sanpo_map, _ = SanpoMapRepository(db_session).create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.commit()
        _pin_id, _keys = _make_pin_with_photo(
            db_session, storage, sanpo_map_id=sanpo_map.id, user_id=owner.id
        )
        upload_repo = PinPhotoUploadRepository(db_session)
        before_usage = upload_repo.sum_attached_bytes(user_id=owner.id)
        assert before_usage > 0

        response = client.delete(f"/sanpo-maps/{sanpo_map.id}", headers=_auth_headers_for(owner))

        assert response.status_code == 204
        assert upload_repo.sum_attached_bytes(user_id=owner.id) == 0

    def test_returns_204_when_storage_is_unconfigured(
        self,
        unconfigured_storage_client: TestClient,
        db_session: Session,
        auth_headers: dict[str, str],
        authenticated_user: User,
    ) -> None:
        sanpo_map, _ = SanpoMapRepository(db_session).create_with_owner(
            owner_user_id=authenticated_user.id, name="地図", is_default=True
        )
        db_session.commit()
        PinRepository(db_session).create(
            sanpo_map_id=sanpo_map.id,
            created_by_user_id=authenticated_user.id,
            client_pin_id=uuid.uuid4(),
            name=None,
            memo=None,
            latitude=0,
            longitude=0,
            client_walk_id=None,
        )
        db_session.commit()

        response = unconfigured_storage_client.delete(
            f"/sanpo-maps/{sanpo_map.id}", headers=auth_headers
        )

        assert response.status_code == 204
        assert _sanpo_map_exists(sanpo_map.id) is False

    def test_other_users_map_delete_is_404_and_data_survives(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        db_session: Session,
    ) -> None:
        client, storage = fake_storage_client
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        sanpo_map, _ = SanpoMapRepository(db_session).create_with_owner(
            owner_user_id=owner.id, name="他人の地図", is_default=True
        )
        db_session.commit()
        pin_id, (s3_key, thumbnail_s3_key) = _make_pin_with_photo(
            db_session, storage, sanpo_map_id=sanpo_map.id, user_id=owner.id
        )

        response = client.delete(f"/sanpo-maps/{sanpo_map.id}", headers=_auth_headers_for(stranger))

        assert response.status_code == 404
        assert db_session.get(SanpoMap, sanpo_map.id) is not None
        assert PinRepository(db_session).load_read_model(pin_id, photos_limit=10) is not None
        assert storage.head(s3_key) is not None
        assert storage.head(thumbnail_s3_key) is not None

    def test_deleted_maps_pins_are_404(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        db_session: Session,
    ) -> None:
        client, storage = fake_storage_client
        owner = make_user(db_session, subject="owner")
        sanpo_map, _ = SanpoMapRepository(db_session).create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.commit()
        headers = _auth_headers_for(owner)

        client.delete(f"/sanpo-maps/{sanpo_map.id}", headers=headers)

        response = client.get("/pins", params={"sanpo_map_id": str(sanpo_map.id)}, headers=headers)
        assert response.status_code == 404

    def test_deleting_the_only_default_map_lets_post_pins_recreate_it(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        db_session: Session,
    ) -> None:
        """唯一の既定地図を消すと繰り上げ先が無いため既定なしになるが、次の
        `POST /pins`（`sanpo_map_id` 省略）が「最初の地図」を既定として作り直す
        （ADR-009 決定3・決定27）。
        """
        client, _storage = fake_storage_client
        owner = make_user(db_session, subject="owner")
        sanpo_map, _ = SanpoMapRepository(db_session).create_with_owner(
            owner_user_id=owner.id, name="唯一の地図", is_default=True
        )
        db_session.commit()
        headers = _auth_headers_for(owner)

        client.delete(f"/sanpo-maps/{sanpo_map.id}", headers=headers)

        create_pin_response = client.post(
            "/pins",
            headers=headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
            },
        )

        assert create_pin_response.status_code == 201
        body = create_pin_response.json()
        assert body["sanpo_map"]["name"] == "最初の地図"
        assert body["sanpo_map"]["is_default"] is True


class TestListSanpoMapsExpandPinCount:
    def test_counts_own_and_editor_maps_and_excludes_other_users_pins(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        db_session: Session,
    ) -> None:
        client, storage = fake_storage_client
        owner = make_user(db_session, subject="owner")
        stranger = make_user(db_session, subject="stranger")
        repo = SanpoMapRepository(db_session)
        map_with_pins, _ = repo.create_with_owner(
            owner_user_id=owner.id, name="ピンあり", is_default=True
        )
        map_without_pins, _ = repo.create_with_owner(
            owner_user_id=owner.id, name="ピンなし", is_default=False
        )
        editor_map, _ = repo.create_with_owner(
            owner_user_id=stranger.id, name="編集者として参加", is_default=True
        )
        db_session.add(SanpoMapMember(sanpo_map_id=editor_map.id, user_id=owner.id, role="editor"))
        db_session.commit()
        others_private_map, _ = repo.create_with_owner(
            owner_user_id=stranger.id, name="他人だけの地図", is_default=False
        )
        db_session.commit()

        for _ in range(3):
            _make_pin_with_photo(
                db_session, storage, sanpo_map_id=map_with_pins.id, user_id=owner.id
            )
        _make_pin_with_photo(db_session, storage, sanpo_map_id=editor_map.id, user_id=stranger.id)
        _make_pin_with_photo(
            db_session, storage, sanpo_map_id=others_private_map.id, user_id=stranger.id
        )

        response = client.get(
            "/sanpo-maps", params={"expand": "pin_count"}, headers=_auth_headers_for(owner)
        )

        assert response.status_code == 200
        counts_by_id = {item["id"]: item["pin_count"] for item in response.json()["items"]}
        assert counts_by_id[str(map_with_pins.id)] == 3
        assert counts_by_id[str(map_without_pins.id)] == 0
        assert counts_by_id[str(editor_map.id)] == 1
        assert str(others_private_map.id) not in counts_by_id
