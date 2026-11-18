import uuid
from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from sanposcape.integrations.aws.s3 import FakeObjectStorage
from sanposcape.sanpo_maps.conftest import (
    create_pin_photo_row,
    create_upload_row,
    make_sanpo_map,
    make_user,
    seed_staging_photo,
)
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.pins.repository import PinRepository
from sanposcape.users.models import User


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


class TestPhotoTakenAtEndToEnd:
    """撮影日時（`taken_at`）が枠の発行から全ての写真の応答まで通る（ADR-009 決定34）。

    日時は文字列ではなく瞬間で比べる（応答は UTC で、`Z` か `+00:00` かは直列化しだい）。
    """

    _SENT = "2026-07-02T09:14:05+09:00"

    def _issue_upload(
        self,
        client: TestClient,
        storage: FakeObjectStorage,
        auth_headers: dict[str, str],
        user: User,
        *,
        taken_at: str | None,
    ) -> str:
        body: dict[str, object] = {"content_type": "image/jpeg", "byte_size": 1000}
        if taken_at is not None:
            body["taken_at"] = taken_at
        response = client.post("/pin-photo-uploads", headers=auth_headers, json=body)
        assert response.status_code == 201
        upload_id = response.json()["upload_id"]
        seed_staging_photo(storage, user_id=user.id, upload_id=uuid.UUID(upload_id))
        return upload_id

    @staticmethod
    def _assert_taken_at(photo: dict, expected: str | None) -> None:
        assert "taken_at" in photo
        if expected is None:
            assert photo["taken_at"] is None
        else:
            assert datetime.fromisoformat(photo["taken_at"]) == datetime.fromisoformat(expected)

    def test_taken_at_flows_through_every_photo_response(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, storage = fake_storage_client
        first = self._issue_upload(
            client, storage, auth_headers, authenticated_user, taken_at=self._SENT
        )

        # POST /pins
        created = client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
                "photo_upload_ids": [first],
            },
        )
        assert created.status_code == 201
        pin = created.json()
        pin_id = pin["id"]
        self._assert_taken_at(pin["photos"][0], self._SENT)

        # GET /pins/{id}
        detail = client.get(f"/pins/{pin_id}", headers=auth_headers).json()
        self._assert_taken_at(detail["photos"][0], self._SENT)

        # GET /pins?sanpo_map_id= (cover_photo)
        listed = client.get(
            "/pins", headers=auth_headers, params={"sanpo_map_id": pin["sanpo_map"]["id"]}
        ).json()
        cover = next(item for item in listed["items"] if item["id"] == pin_id)["cover_photo"]
        self._assert_taken_at(cover, self._SENT)

        # POST /pins/{id}/photos（2枚目は taken_at なし）
        second = self._issue_upload(
            client, storage, auth_headers, authenticated_user, taken_at=None
        )
        added = client.post(
            f"/pins/{pin_id}/photos",
            headers=auth_headers,
            json={"photo_upload_ids": [second]},
        )
        assert added.status_code == 200
        self._assert_taken_at(added.json()["items"][0], None)

        # 既存の写真（taken_at を持たない行）も null で返る。
        create_pin_photo_row(
            db_session,
            storage,
            pin_id=uuid.UUID(pin_id),
            uploaded_by_user_id=authenticated_user.id,
            position=2,
        )

        # GET /pins/{id}/photos
        photos = client.get(f"/pins/{pin_id}/photos", headers=auth_headers).json()["items"]
        assert len(photos) == 3
        self._assert_taken_at(photos[0], self._SENT)
        self._assert_taken_at(photos[1], None)
        self._assert_taken_at(photos[2], None)

    def test_photo_with_taken_at_row_is_returned(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, storage = fake_storage_client
        pin = client.post(
            "/pins",
            headers=auth_headers,
            json={"client_pin_id": str(uuid.uuid4()), "location": {"latitude": 0, "longitude": 0}},
        ).json()
        create_pin_photo_row(
            db_session,
            storage,
            pin_id=uuid.UUID(pin["id"]),
            uploaded_by_user_id=authenticated_user.id,
            position=0,
            taken_at=datetime.fromisoformat(self._SENT),
        )

        photos = client.get(f"/pins/{pin['id']}/photos", headers=auth_headers).json()["items"]

        self._assert_taken_at(photos[0], self._SENT)


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

    def test_unconfigured_storage_returns_200_with_null_urls(
        self,
        unconfigured_storage_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client = unconfigured_storage_client
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
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

        response = client.get(f"/pins/{pin.id}/photos", headers=auth_headers)

        assert response.status_code == 200
        photo = response.json()["items"][0]
        assert photo["thumbnail"] is None
        assert photo["original_url"] is None


class TestDeletePinPhotoRouter:
    def test_requires_authentication(
        self, fake_storage_client: tuple[TestClient, FakeObjectStorage]
    ) -> None:
        client, _storage = fake_storage_client
        response = client.delete(f"/pins/{uuid.uuid4()}/photos/{uuid.uuid4()}")
        assert response.status_code == 401

    def test_deletes_photo_then_resend_is_404(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, storage = fake_storage_client
        pin_response = client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
            },
        )
        assert pin_response.status_code == 201
        pin_id = pin_response.json()["id"]
        photo = create_pin_photo_row(
            db_session,
            storage,
            pin_id=uuid.UUID(pin_id),
            uploaded_by_user_id=authenticated_user.id,
            position=0,
        )

        response = client.delete(f"/pins/{pin_id}/photos/{photo.id}", headers=auth_headers)
        assert response.status_code == 204
        assert storage.head(photo.s3_key) is None

        again = client.delete(f"/pins/{pin_id}/photos/{photo.id}", headers=auth_headers)
        assert again.status_code == 404

    def test_missing_pin_is_404(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.delete(
            f"/pins/{uuid.uuid4()}/photos/{uuid.uuid4()}", headers=auth_headers
        )
        assert response.status_code == 404

    def test_missing_photo_is_404(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        pin_response = client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
            },
        )
        assert pin_response.status_code == 201
        pin_id = pin_response.json()["id"]

        response = client.delete(f"/pins/{pin_id}/photos/{uuid.uuid4()}", headers=auth_headers)
        assert response.status_code == 404

    def test_deleting_photo_updates_capacity_and_cover_photo(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, storage = fake_storage_client
        pin_response = client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
            },
        )
        assert pin_response.status_code == 201
        pin_id = pin_response.json()["id"]
        first_photo = create_pin_photo_row(
            db_session,
            storage,
            pin_id=uuid.UUID(pin_id),
            uploaded_by_user_id=authenticated_user.id,
            position=0,
        )
        second_photo = create_pin_photo_row(
            db_session,
            storage,
            pin_id=uuid.UUID(pin_id),
            uploaded_by_user_id=authenticated_user.id,
            position=1,
        )

        response = client.delete(f"/pins/{pin_id}/photos/{first_photo.id}", headers=auth_headers)
        assert response.status_code == 204

        pin_detail = client.get(f"/pins/{pin_id}", headers=auth_headers).json()
        assert pin_detail["photo_count"] == 1
        assert pin_detail["photos"][0]["id"] == str(second_photo.id)

    def test_resend_upload_id_after_photo_delete_is_409(
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
        pin_response = client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
                "photo_upload_ids": [str(upload_id)],
            },
        )
        assert pin_response.status_code == 201
        pin_id = pin_response.json()["id"]
        photo_id = pin_response.json()["photos"][0]["id"]

        delete_response = client.delete(f"/pins/{pin_id}/photos/{photo_id}", headers=auth_headers)
        assert delete_response.status_code == 204

        resend = client.post(
            f"/pins/{pin_id}/photos",
            headers=auth_headers,
            json={"photo_upload_ids": [str(upload_id)]},
        )
        assert resend.status_code == 409
        assert resend.json()["code"] == "photo_upload_not_ready"

    def test_storage_delete_failure_still_returns_204(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, storage = fake_storage_client
        pin_response = client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
            },
        )
        assert pin_response.status_code == 201
        pin_id = pin_response.json()["id"]
        photo = create_pin_photo_row(
            db_session,
            storage,
            pin_id=uuid.UUID(pin_id),
            uploaded_by_user_id=authenticated_user.id,
            position=0,
        )
        storage.delete_many = lambda keys: list(keys)  # type: ignore[method-assign]

        response = client.delete(f"/pins/{pin_id}/photos/{photo.id}", headers=auth_headers)

        assert response.status_code == 204

    def test_unconfigured_storage_still_returns_204(
        self,
        unconfigured_storage_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client = unconfigured_storage_client
        pin_response = client.post(
            "/pins",
            headers=auth_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "location": {"latitude": 0, "longitude": 0},
            },
        )
        assert pin_response.status_code == 201
        pin_id = pin_response.json()["id"]
        photo = create_pin_photo_row(
            db_session,
            None,
            pin_id=uuid.UUID(pin_id),
            uploaded_by_user_id=authenticated_user.id,
            position=0,
        )

        response = client.delete(f"/pins/{pin_id}/photos/{photo.id}", headers=auth_headers)

        assert response.status_code == 204
