import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from sanposcape.integrations.aws.s3 import FakeObjectStorage
from sanposcape.sanpo_maps.conftest import (
    create_pin_photo_row,
)
from sanposcape.users.models import User


class TestDeletePinRouter:
    def _create_pin(self, client: TestClient, headers: dict[str, str]) -> str:
        response = client.post(
            "/pins",
            headers=headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
            },
        )
        assert response.status_code == 201
        return response.json()["id"]

    def test_requires_authentication(
        self, fake_storage_client: tuple[TestClient, FakeObjectStorage]
    ) -> None:
        client, _storage = fake_storage_client
        response = client.delete(f"/pins/{uuid.uuid4()}")
        assert response.status_code == 401

    def test_deletes_pin_then_get_is_404(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        pin_id = self._create_pin(client, auth_headers)

        response = client.delete(f"/pins/{pin_id}", headers=auth_headers)
        assert response.status_code == 204

        after = client.get(f"/pins/{pin_id}", headers=auth_headers)
        assert after.status_code == 404

    def test_resend_after_delete_is_404(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        pin_id = self._create_pin(client, auth_headers)
        first = client.delete(f"/pins/{pin_id}", headers=auth_headers)
        assert first.status_code == 204

        second = client.delete(f"/pins/{pin_id}", headers=auth_headers)
        assert second.status_code == 404

    def test_missing_pin_is_404(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.delete(f"/pins/{uuid.uuid4()}", headers=auth_headers)
        assert response.status_code == 404

    def test_deletes_photos_and_tags_and_s3_objects(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, storage = fake_storage_client
        pin_id = self._create_pin(client, auth_headers)
        photo = create_pin_photo_row(
            db_session,
            storage,
            pin_id=uuid.UUID(pin_id),
            uploaded_by_user_id=authenticated_user.id,
            position=0,
        )
        tag_response = client.patch(
            f"/pins/{pin_id}", headers=auth_headers, json={"add_tags": ["桜"]}
        )
        assert tag_response.status_code == 200

        response = client.delete(f"/pins/{pin_id}", headers=auth_headers)

        assert response.status_code == 204
        assert storage.head(photo.s3_key) is None
        assert photo.thumbnail_s3_key is not None
        assert storage.head(photo.thumbnail_s3_key) is None

    def test_unconfigured_storage_still_returns_204(
        self,
        unconfigured_storage_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client = unconfigured_storage_client
        response = client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
            },
        )
        assert response.status_code == 201
        pin_id = response.json()["id"]
        create_pin_photo_row(
            db_session,
            None,
            pin_id=uuid.UUID(pin_id),
            uploaded_by_user_id=authenticated_user.id,
            position=0,
        )

        response = client.delete(f"/pins/{pin_id}", headers=auth_headers)

        assert response.status_code == 204
