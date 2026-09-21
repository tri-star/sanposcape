from fastapi.testclient import TestClient

from sanposcape.integrations.aws.s3 import FakeObjectStorage
from sanposcape.pins.tests.conftest import create_upload_row


class TestCreatePinPhotoUpload:
    def test_requires_authentication(
        self, fake_storage_client: tuple[TestClient, FakeObjectStorage]
    ) -> None:
        client, _storage = fake_storage_client
        response = client.post(
            "/pin-photo-uploads", json={"content_type": "image/jpeg", "byte_size": 100}
        )
        assert response.status_code == 401

    def test_returns_presigned_form(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.post(
            "/pin-photo-uploads",
            headers=auth_headers,
            json={"content_type": "image/jpeg", "byte_size": 1000},
        )

        assert response.status_code == 201
        body = response.json()
        assert body["max_byte_size"] == 10 * 1024 * 1024
        assert "upload_id" in body
        assert body["upload"]["url"].endswith("/dev-storage/uploads")
        assert "key" in body["upload"]["fields"]

    def test_rejects_non_jpeg_content_type(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.post(
            "/pin-photo-uploads",
            headers=auth_headers,
            json={"content_type": "image/png", "byte_size": 1000},
        )
        assert response.status_code == 422

    def test_too_large_returns_413(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.post(
            "/pin-photo-uploads",
            headers=auth_headers,
            json={"content_type": "image/jpeg", "byte_size": 20 * 1024 * 1024},
        )
        assert response.status_code == 413

    def test_too_many_pending_returns_429(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user,
        db_session,
    ) -> None:
        client, _storage = fake_storage_client
        # 既定の PIN_PHOTO_MAX_PENDING_UPLOADS(30) 件を先に作っておく。
        for _ in range(30):
            create_upload_row(db_session, user_id=authenticated_user.id)

        response = client.post(
            "/pin-photo-uploads",
            headers=auth_headers,
            json={"content_type": "image/jpeg", "byte_size": 100},
        )
        assert response.status_code == 429

    def test_unconfigured_storage_returns_503(
        self, unconfigured_storage_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = unconfigured_storage_client.post(
            "/pin-photo-uploads",
            headers=auth_headers,
            json={"content_type": "image/jpeg", "byte_size": 100},
        )
        assert response.status_code == 503
