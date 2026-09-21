import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from sanposcape.integrations.aws.s3 import FakeObjectStorage
from sanposcape.pins.repository import PinRepository
from sanposcape.pins.tests.conftest import create_upload_row, make_user, seed_staging_photo
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
