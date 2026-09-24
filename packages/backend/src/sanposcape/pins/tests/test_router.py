import struct
import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from sanposcape.auth.tokens import create_access_token
from sanposcape.config import Settings
from sanposcape.integrations.aws.s3 import FakeObjectStorage
from sanposcape.pins.photo_keys import staging_key
from sanposcape.pins.repository import PinRepository
from sanposcape.pins.tests.conftest import (
    create_pin_photo_row,
    create_upload_row,
    make_jpeg_bytes,
    make_user,
    seed_staging_photo,
)
from sanposcape.sanpo_maps.models import SanpoMapMember
from sanposcape.sanpo_maps.repository import SanpoMapRepository
from sanposcape.users.models import User


class TestCreatePin:
    def test_requires_authentication(
        self, fake_storage_client: tuple[TestClient, FakeObjectStorage]
    ) -> None:
        client, _storage = fake_storage_client
        response = client.post(
            "/pins",
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
            },
        )
        assert response.status_code == 401

    def test_creates_pin_in_default_map(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "name": "桜のトンネル",
                "memo": "4月上旬が見頃",
                "location": {"latitude": 35.681236, "longitude": 139.767125},
                "tags": ["桜", "#撮影スポット"],
            },
        )

        assert response.status_code == 201
        body = response.json()
        assert body["sanpo_map"]["name"] == "最初の地図"
        assert body["sanpo_map"]["is_default"] is True
        assert {tag["label"] for tag in body["tags"]} == {"桜", "撮影スポット"}
        assert body["photos"] == []
        assert body["photo_count"] == 0

    def test_idempotent_resend_returns_200_with_existing_pin(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        client_pin_id = str(uuid.uuid4())
        payload = {
            "client_pin_id": client_pin_id,
            "name": "A",
            "location": {"latitude": 0, "longitude": 0},
        }
        first = client.post("/pins", headers=auth_headers, json=payload)
        assert first.status_code == 201

        second = client.post(
            "/pins",
            headers=auth_headers,
            json={**payload, "name": "B"},
        )

        assert second.status_code == 200
        assert second.json()["id"] == first.json()["id"]
        assert second.json()["name"] == "A"

    def test_explicit_null_sanpo_map_id_is_422(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "sanpo_map_id": None,
                "location": {"latitude": 0, "longitude": 0},
            },
        )
        assert response.status_code == 422

    def test_tag_within_limit_after_normalization_is_accepted(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        """PR #93 T5: 先頭の `#` や前後の空白を含めた生の長さではなく、正規化後の
        長さ(20文字)で判定する。生の長さは23文字だが、正規化後は20文字なので通る。
        """
        client, _storage = fake_storage_client
        tag = "桜" * 20
        response = client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
                "tags": ["#" + tag + "  "],
            },
        )

        assert response.status_code == 201
        assert {t["label"] for t in response.json()["tags"]} == {tag}

    def test_tag_over_limit_after_normalization_is_422(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
                "tags": ["桜" * 21],
            },
        )

        assert response.status_code == 422

    def test_non_member_sanpo_map_id_is_404(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        db_session: Session,
    ) -> None:
        client, _storage = fake_storage_client
        stranger = make_user(db_session, subject="stranger")
        sanpo_map, _ = SanpoMapRepository(db_session).create_with_owner(
            owner_user_id=stranger.id, name="他人の地図", is_default=True
        )
        db_session.commit()

        response = client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "sanpo_map_id": str(sanpo_map.id),
                "location": {"latitude": 0, "longitude": 0},
            },
        )
        assert response.status_code == 404

    def test_11_photo_upload_ids_is_422(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
                "photo_upload_ids": [str(uuid.uuid4()) for _ in range(11)],
            },
        )
        assert response.status_code == 422

    def test_creates_pin_with_photo_and_returns_thumbnail_url(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, storage = fake_storage_client
        upload_id = uuid.uuid4()
        seed_staging_photo(storage, user_id=authenticated_user.id, upload_id=upload_id)
        create_upload_row(db_session, user_id=authenticated_user.id, upload_id=upload_id)

        response = client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
                "photo_upload_ids": [str(upload_id)],
            },
        )

        assert response.status_code == 201
        body = response.json()
        assert body["photo_count"] == 1
        photo = body["photos"][0]
        assert photo["thumbnail"]["url"].startswith("http://testserver/dev-storage/objects/")

        # サムネイル URL は実際に取得できる（S3 互換の 200 応答）。
        thumb_response = client.get(photo["thumbnail"]["url"].replace("http://testserver", ""))
        assert thumb_response.status_code == 200
        assert thumb_response.headers["content-type"] == "image/jpeg"

    def test_decompression_bomb_photo_returns_409_not_500(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """PR #93 T6 回帰テスト: ヘッダーの寸法だけを Pillow の decompression bomb
        しきい値の2倍超に改ざんした小さい JPEG（ピクセルデータ自体は小さいまま）を
        staging に置いても、500 にならず 409（`photo_upload_not_ready`）になる。
        """
        client, storage = fake_storage_client
        upload_id = uuid.uuid4()
        data = bytearray(make_jpeg_bytes((16, 16)))
        sof0_marker = data.find(b"\xff\xc0")
        assert sof0_marker != -1
        huge_dimension = 65_500
        data[sof0_marker + 5 : sof0_marker + 7] = struct.pack(">H", huge_dimension)
        data[sof0_marker + 7 : sof0_marker + 9] = struct.pack(">H", huge_dimension)
        storage.put_bytes(
            staging_key(user_id=authenticated_user.id, upload_id=upload_id),
            bytes(data),
            content_type="image/jpeg",
        )
        create_upload_row(db_session, user_id=authenticated_user.id, upload_id=upload_id)

        response = client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
                "photo_upload_ids": [str(upload_id)],
            },
        )

        assert response.status_code == 409
        assert response.json()["code"] == "photo_upload_not_ready"

    def test_invalid_photo_upload_id_returns_409(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
                "photo_upload_ids": [str(uuid.uuid4())],
            },
        )
        assert response.status_code == 409
        # PR #93 T15: mobile が「容量超過」と区別できるよう、機械可読な code を持つ。
        assert response.json()["code"] == "photo_upload_not_ready"

    def test_storage_quota_exceeded_returns_409_with_quota_code(
        self,
        fake_storage_tiny_quota_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """PR #93 T15: 容量超過は `photo_upload_not_ready` と異なる code で区別できる。"""
        client, storage = fake_storage_tiny_quota_client
        upload = create_upload_row(db_session, user_id=authenticated_user.id)
        seed_staging_photo(storage, user_id=authenticated_user.id, upload_id=upload.id)

        response = client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
                "photo_upload_ids": [str(upload.id)],
            },
        )

        assert response.status_code == 409
        assert response.json()["code"] == "storage_quota_exceeded"

    def test_unconfigured_storage_without_photos_still_succeeds(
        self, unconfigured_storage_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = unconfigured_storage_client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
            },
        )
        assert response.status_code == 201

    def test_unconfigured_storage_with_photos_returns_503(
        self,
        unconfigured_storage_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        # 枠自体は有効（pending・未期限）でないと、確定処理が storage に触れる前に
        # 409（Photo upload not ready）で終わってしまう。ストレージ未構成による 503 を
        # 検証するには、まず有効な枠を用意しておく必要がある。
        upload = create_upload_row(db_session, user_id=authenticated_user.id)

        response = unconfigured_storage_client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
                "photo_upload_ids": [str(upload.id)],
            },
        )
        assert response.status_code == 503


class TestAddPinPhotos:
    def _create_pin(self, client: TestClient, auth_headers: dict[str, str]) -> str:
        response = client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
            },
        )
        assert response.status_code == 201
        return response.json()["id"]

    def test_adds_photo_and_reports_total_count(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, storage = fake_storage_client
        pin_id = self._create_pin(client, auth_headers)
        upload_id = uuid.uuid4()
        seed_staging_photo(storage, user_id=authenticated_user.id, upload_id=upload_id)
        create_upload_row(db_session, user_id=authenticated_user.id, upload_id=upload_id)

        response = client.post(
            f"/pins/{pin_id}/photos",
            headers=auth_headers,
            json={"photo_upload_ids": [str(upload_id)]},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["photo_count"] == 1
        assert body["items"][0]["position"] == 0

    def test_non_member_pin_returns_404(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        db_session: Session,
    ) -> None:
        client, _storage = fake_storage_client
        owner = make_user(db_session, subject="owner")
        sanpo_map, _ = SanpoMapRepository(db_session).create_with_owner(
            owner_user_id=owner.id, name="地図", is_default=True
        )
        db_session.commit()

        pin, _ = PinRepository(db_session).create(
            sanpo_map_id=sanpo_map.id,
            created_by_user_id=owner.id,
            client_pin_id=uuid.uuid4(),
            name=None,
            memo=None,
            latitude=0,
            longitude=0,
            client_walk_id=None,
        )
        db_session.commit()

        response = client.post(
            f"/pins/{pin.id}/photos",
            headers=auth_headers,
            json={"photo_upload_ids": [str(uuid.uuid4())]},
        )
        assert response.status_code == 404

    def test_missing_pin_returns_404(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.post(
            f"/pins/{uuid.uuid4()}/photos",
            headers=auth_headers,
            json={"photo_upload_ids": [str(uuid.uuid4())]},
        )
        assert response.status_code == 404

    def test_empty_photo_upload_ids_is_422(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        pin_id = self._create_pin(client, auth_headers)

        response = client.post(
            f"/pins/{pin_id}/photos", headers=auth_headers, json={"photo_upload_ids": []}
        )
        assert response.status_code == 422


def _create_sanpo_map(db_session: Session, *, owner_user_id: uuid.UUID) -> uuid.UUID:
    sanpo_map, _ = SanpoMapRepository(db_session).create_with_owner(
        owner_user_id=owner_user_id, name="テスト地図", is_default=True
    )
    db_session.commit()
    return sanpo_map.id


class TestListPins:
    def _create_pin(
        self,
        client: TestClient,
        auth_headers: dict[str, str],
        *,
        sanpo_map_id: uuid.UUID | None = None,
        name: str | None = None,
        memo: str | None = None,
        latitude: float = 0,
        longitude: float = 0,
        tags: list[str] | None = None,
    ) -> str:
        payload: dict[str, object] = {
            "client_pin_id": str(uuid.uuid4()),
            "location": {"latitude": latitude, "longitude": longitude},
        }
        if sanpo_map_id is not None:
            payload["sanpo_map_id"] = str(sanpo_map_id)
        if name is not None:
            payload["name"] = name
        if memo is not None:
            payload["memo"] = memo
        if tags is not None:
            payload["tags"] = tags
        response = client.post("/pins", headers=auth_headers, json=payload)
        assert response.status_code == 201
        return response.json()["id"]

    def test_requires_authentication(
        self, fake_storage_client: tuple[TestClient, FakeObjectStorage]
    ) -> None:
        client, _storage = fake_storage_client
        response = client.get("/pins", params={"sanpo_map_id": str(uuid.uuid4())})
        assert response.status_code == 401

    def test_missing_sanpo_map_id_is_422(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.get("/pins", headers=auth_headers)
        assert response.status_code == 422

    def test_non_member_sanpo_map_id_is_404(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        db_session: Session,
    ) -> None:
        client, _storage = fake_storage_client
        stranger = make_user(db_session, subject="stranger")
        sanpo_map_id = _create_sanpo_map(db_session, owner_user_id=stranger.id)

        response = client.get(
            "/pins", headers=auth_headers, params={"sanpo_map_id": str(sanpo_map_id)}
        )
        assert response.status_code == 404

    def test_nonexistent_sanpo_map_id_is_404(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.get(
            "/pins", headers=auth_headers, params={"sanpo_map_id": str(uuid.uuid4())}
        )
        assert response.status_code == 404

    def test_partial_bounding_box_is_422(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, _storage = fake_storage_client
        sanpo_map_id = _create_sanpo_map(db_session, owner_user_id=authenticated_user.id)

        response = client.get(
            "/pins",
            headers=auth_headers,
            params={
                "sanpo_map_id": str(sanpo_map_id),
                "min_latitude": 0,
                "max_latitude": 1,
                "min_longitude": 0,
                # max_longitude が欠けている
            },
        )
        assert response.status_code == 422

    def test_min_greater_than_max_is_422(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, _storage = fake_storage_client
        sanpo_map_id = _create_sanpo_map(db_session, owner_user_id=authenticated_user.id)

        response = client.get(
            "/pins",
            headers=auth_headers,
            params={
                "sanpo_map_id": str(sanpo_map_id),
                "min_latitude": 2,
                "max_latitude": 1,
                "min_longitude": 0,
                "max_longitude": 1,
            },
        )
        assert response.status_code == 422

    def test_out_of_range_latitude_is_422(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, _storage = fake_storage_client
        sanpo_map_id = _create_sanpo_map(db_session, owner_user_id=authenticated_user.id)

        response = client.get(
            "/pins",
            headers=auth_headers,
            params={
                "sanpo_map_id": str(sanpo_map_id),
                "min_latitude": 91,
                "max_latitude": 92,
                "min_longitude": 0,
                "max_longitude": 1,
            },
        )
        assert response.status_code == 422

    def test_tag_empty_after_normalization_is_422(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, _storage = fake_storage_client
        sanpo_map_id = _create_sanpo_map(db_session, owner_user_id=authenticated_user.id)

        response = client.get(
            "/pins",
            headers=auth_headers,
            params={"sanpo_map_id": str(sanpo_map_id), "tags": ["#"]},
        )
        assert response.status_code == 422

    def test_11_tags_is_422(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, _storage = fake_storage_client
        sanpo_map_id = _create_sanpo_map(db_session, owner_user_id=authenticated_user.id)

        response = client.get(
            "/pins",
            headers=auth_headers,
            params={"sanpo_map_id": str(sanpo_map_id), "tags": [f"t{i}" for i in range(11)]},
        )
        assert response.status_code == 422

    def test_limit_out_of_range_is_422(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, _storage = fake_storage_client
        sanpo_map_id = _create_sanpo_map(db_session, owner_user_id=authenticated_user.id)

        too_small = client.get(
            "/pins",
            headers=auth_headers,
            params={"sanpo_map_id": str(sanpo_map_id), "limit": 0},
        )
        too_large = client.get(
            "/pins",
            headers=auth_headers,
            params={"sanpo_map_id": str(sanpo_map_id), "limit": 201},
        )
        assert too_small.status_code == 422
        assert too_large.status_code == 422

    def test_invalid_cursor_is_400(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, _storage = fake_storage_client
        sanpo_map_id = _create_sanpo_map(db_session, owner_user_id=authenticated_user.id)

        response = client.get(
            "/pins",
            headers=auth_headers,
            params={"sanpo_map_id": str(sanpo_map_id), "cursor": "not-a-valid-cursor"},
        )
        assert response.status_code == 400

    def test_pin_with_photo_returns_cover_photo_and_photo_count(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, storage = fake_storage_client
        pin_id = self._create_pin(client, auth_headers)
        create_pin_photo_row(
            db_session,
            storage,
            pin_id=uuid.UUID(pin_id),
            uploaded_by_user_id=authenticated_user.id,
            position=0,
        )

        response = client.get(
            "/pins",
            headers=auth_headers,
            params={"sanpo_map_id": _get_sanpo_map_id(client, auth_headers, pin_id)},
        )

        assert response.status_code == 200
        item = next(item for item in response.json()["items"] if item["id"] == pin_id)
        assert item["photo_count"] == 1
        cover = item["cover_photo"]
        assert cover is not None
        thumb_response = client.get(cover["thumbnail"]["url"].replace("http://testserver", ""))
        assert thumb_response.status_code == 200
        original_response = client.get(cover["original_url"].replace("http://testserver", ""))
        assert original_response.status_code == 200

    def test_pin_without_photo_has_null_cover_photo_and_zero_count(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        pin_id = self._create_pin(client, auth_headers)

        response = client.get(
            "/pins",
            headers=auth_headers,
            params={"sanpo_map_id": _get_sanpo_map_id(client, auth_headers, pin_id)},
        )

        assert response.status_code == 200
        item = next(item for item in response.json()["items"] if item["id"] == pin_id)
        assert item["cover_photo"] is None
        assert item["photo_count"] == 0

    def test_pagination_across_two_pages_reaches_null_next_cursor(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        pin_ids = [self._create_pin(client, auth_headers) for _ in range(3)]
        sanpo_map_id = _get_sanpo_map_id(client, auth_headers, pin_ids[0])

        first_page = client.get(
            "/pins",
            headers=auth_headers,
            params={"sanpo_map_id": sanpo_map_id, "limit": 2},
        )
        assert first_page.status_code == 200
        first_body = first_page.json()
        assert len(first_body["items"]) == 2
        assert first_body["next_cursor"] is not None

        second_page = client.get(
            "/pins",
            headers=auth_headers,
            params={
                "sanpo_map_id": sanpo_map_id,
                "limit": 2,
                "cursor": first_body["next_cursor"],
            },
        )
        assert second_page.status_code == 200
        second_body = second_page.json()
        assert len(second_body["items"]) == 1
        assert second_body["next_cursor"] is None

        all_ids = {item["id"] for item in first_body["items"]} | {
            item["id"] for item in second_body["items"]
        }
        assert all_ids == set(pin_ids)

    def test_q_and_tags_narrow_down_results(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """`q` と `tags` は AND で絞り込む。`tags` はどちらも「絶景」で揃え、`q`（名前の
        部分一致）だけが変わる3件を用意することで、タグの ILIKE 一致に巻き込まれずに
        両条件が独立に効くことを確認する。
        """
        client, _storage = fake_storage_client
        sanpo_map_id = _create_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        matching = self._create_pin(
            client, auth_headers, sanpo_map_id=sanpo_map_id, name="桜のトンネル", tags=["絶景"]
        )
        wrong_tag = self._create_pin(
            client, auth_headers, sanpo_map_id=sanpo_map_id, name="桜並木", tags=["紅葉"]
        )
        wrong_name = self._create_pin(
            client, auth_headers, sanpo_map_id=sanpo_map_id, name="展望台", tags=["絶景"]
        )

        response = client.get(
            "/pins",
            headers=auth_headers,
            params={"sanpo_map_id": str(sanpo_map_id), "q": "桜", "tags": ["絶景"]},
        )

        assert response.status_code == 200
        ids = {item["id"] for item in response.json()["items"]}
        assert ids == {matching}
        assert wrong_tag not in ids
        assert wrong_name not in ids

    def test_bbox_narrows_down_results(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, _storage = fake_storage_client
        sanpo_map_id = _create_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        inside = self._create_pin(
            client, auth_headers, sanpo_map_id=sanpo_map_id, latitude=1, longitude=1
        )
        outside = self._create_pin(
            client, auth_headers, sanpo_map_id=sanpo_map_id, latitude=10, longitude=10
        )

        response = client.get(
            "/pins",
            headers=auth_headers,
            params={
                "sanpo_map_id": str(sanpo_map_id),
                "min_latitude": 0,
                "max_latitude": 2,
                "min_longitude": 0,
                "max_longitude": 2,
            },
        )

        assert response.status_code == 200
        ids = {item["id"] for item in response.json()["items"]}
        assert ids == {inside}
        assert outside not in ids

    def test_editor_member_can_list_pins(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        db_session: Session,
    ) -> None:
        """招待された editor（owner ではない）でも一覧を閲覧できる。"""
        client, _storage = fake_storage_client
        owner = make_user(db_session, subject="owner-for-editor-list")
        editor = make_user(db_session, subject="editor-for-list")
        sanpo_map_id = _create_sanpo_map(db_session, owner_user_id=owner.id)
        db_session.add(SanpoMapMember(sanpo_map_id=sanpo_map_id, user_id=editor.id, role="editor"))
        db_session.commit()
        owner_settings = Settings(
            env="test",
            auth_mode="real",
            auth_jwt_secret="x" * 32,
            google_allowed_audiences=["test-audience"],
            storage_mode="fake",
        )
        owner_token, _ = create_access_token(user_id=owner.id, settings=owner_settings)
        owner_headers = {"Authorization": f"Bearer {owner_token}"}
        pin_id = self._create_pin(client, owner_headers, sanpo_map_id=sanpo_map_id)

        editor_token, _ = create_access_token(user_id=editor.id, settings=owner_settings)
        editor_headers = {"Authorization": f"Bearer {editor_token}"}
        response = client.get(
            "/pins", headers=editor_headers, params={"sanpo_map_id": str(sanpo_map_id)}
        )

        assert response.status_code == 200
        assert {item["id"] for item in response.json()["items"]} == {pin_id}

    def test_unconfigured_storage_returns_200_with_null_urls(
        self,
        unconfigured_storage_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client = unconfigured_storage_client
        sanpo_map_id = _create_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        pin, _ = PinRepository(db_session).create(
            sanpo_map_id=sanpo_map_id,
            created_by_user_id=authenticated_user.id,
            client_pin_id=uuid.uuid4(),
            name=None,
            memo=None,
            latitude=0,
            longitude=0,
            client_walk_id=None,
        )
        db_session.commit()
        create_pin_photo_row(
            db_session, None, pin_id=pin.id, uploaded_by_user_id=authenticated_user.id, position=0
        )

        response = client.get(
            "/pins", headers=auth_headers, params={"sanpo_map_id": str(sanpo_map_id)}
        )

        assert response.status_code == 200
        cover = response.json()["items"][0]["cover_photo"]
        assert cover["thumbnail"] is None
        assert cover["original_url"] is None


def _get_sanpo_map_id(client: TestClient, auth_headers: dict[str, str], pin_id: str) -> str:
    response = client.get(f"/pins/{pin_id}", headers=auth_headers)
    assert response.status_code == 200
    return response.json()["sanpo_map"]["id"]


class TestGetPin:
    def test_requires_authentication(
        self, fake_storage_client: tuple[TestClient, FakeObjectStorage]
    ) -> None:
        client, _storage = fake_storage_client
        response = client.get(f"/pins/{uuid.uuid4()}")
        assert response.status_code == 401

    def test_non_member_pin_returns_404(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        db_session: Session,
    ) -> None:
        client, _storage = fake_storage_client
        owner = make_user(db_session, subject="owner-get")
        sanpo_map_id = _create_sanpo_map(db_session, owner_user_id=owner.id)
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

        response = client.get(f"/pins/{pin.id}", headers=auth_headers)
        assert response.status_code == 404

    def test_missing_pin_returns_404(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.get(f"/pins/{uuid.uuid4()}", headers=auth_headers)
        assert response.status_code == 404

    def test_non_uuid_pin_id_returns_422(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.get("/pins/not-a-uuid", headers=auth_headers)
        assert response.status_code == 422

    def test_photos_over_limit_returns_first_10_with_correct_count(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, storage = fake_storage_client
        response = client.post(
            "/pins",
            headers=auth_headers,
            json={"client_pin_id": str(uuid.uuid4()), "location": {"latitude": 0, "longitude": 0}},
        )
        assert response.status_code == 201
        pin_id = response.json()["id"]
        for i in range(11):
            create_pin_photo_row(
                db_session,
                storage,
                pin_id=uuid.UUID(pin_id),
                uploaded_by_user_id=authenticated_user.id,
                position=i,
            )

        detail = client.get(f"/pins/{pin_id}", headers=auth_headers)

        assert detail.status_code == 200
        body = detail.json()
        assert len(body["photos"]) == 10
        assert body["photo_count"] == 11
        assert body["photos"][0]["original_url"] is not None


class TestListPinPhotos:
    def test_requires_authentication(
        self, fake_storage_client: tuple[TestClient, FakeObjectStorage]
    ) -> None:
        client, _storage = fake_storage_client
        response = client.get(f"/pins/{uuid.uuid4()}/photos")
        assert response.status_code == 401

    def test_non_member_pin_returns_404(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        db_session: Session,
    ) -> None:
        client, _storage = fake_storage_client
        owner = make_user(db_session, subject="owner-photos")
        sanpo_map_id = _create_sanpo_map(db_session, owner_user_id=owner.id)
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

        response = client.get(f"/pins/{pin.id}/photos", headers=auth_headers)
        assert response.status_code == 404

    def test_missing_pin_returns_404(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.get(f"/pins/{uuid.uuid4()}/photos", headers=auth_headers)
        assert response.status_code == 404

    def test_invalid_cursor_is_400(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.post(
            "/pins",
            headers=auth_headers,
            json={"client_pin_id": str(uuid.uuid4()), "location": {"latitude": 0, "longitude": 0}},
        )
        pin_id = response.json()["id"]

        result = client.get(
            f"/pins/{pin_id}/photos", headers=auth_headers, params={"cursor": "not-a-cursor"}
        )
        assert result.status_code == 400

    def test_no_photos_returns_empty_list_and_null_cursor(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.post(
            "/pins",
            headers=auth_headers,
            json={"client_pin_id": str(uuid.uuid4()), "location": {"latitude": 0, "longitude": 0}},
        )
        pin_id = response.json()["id"]

        result = client.get(f"/pins/{pin_id}/photos", headers=auth_headers)

        assert result.status_code == 200
        body = result.json()
        assert body["items"] == []
        assert body["photo_count"] == 0
        assert body["next_cursor"] is None

    def test_paginates_through_all_photos_in_position_order(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, storage = fake_storage_client
        response = client.post(
            "/pins",
            headers=auth_headers,
            json={"client_pin_id": str(uuid.uuid4()), "location": {"latitude": 0, "longitude": 0}},
        )
        pin_id = response.json()["id"]
        photos = [
            create_pin_photo_row(
                db_session,
                storage,
                pin_id=uuid.UUID(pin_id),
                uploaded_by_user_id=authenticated_user.id,
                position=i,
            )
            for i in range(5)
        ]

        collected_ids: list[str] = []
        cursor: str | None = None
        for _ in range(10):
            params = {"limit": 2}
            if cursor is not None:
                params["cursor"] = cursor
            page = client.get(f"/pins/{pin_id}/photos", headers=auth_headers, params=params)
            assert page.status_code == 200
            body = page.json()
            collected_ids.extend(item["id"] for item in body["items"])
            cursor = body["next_cursor"]
            if cursor is None:
                break

        assert collected_ids == [str(photo.id) for photo in photos]
