import uuid

from fastapi.testclient import TestClient

from sanposcape.integrations.aws.s3 import FakeObjectStorage


class TestUpdatePinRouter:
    def _create_pin(
        self, client: TestClient, headers: dict[str, str], *, name: str | None = None
    ) -> str:
        payload: dict[str, object] = {
            "client_pin_id": str(uuid.uuid4()),
            "location": {"latitude": 0, "longitude": 0},
        }
        if name is not None:
            payload["name"] = name
        response = client.post("/pins", headers=headers, json=payload)
        assert response.status_code == 201
        return response.json()["id"]

    def test_requires_authentication(
        self, fake_storage_client: tuple[TestClient, FakeObjectStorage]
    ) -> None:
        client, _storage = fake_storage_client
        response = client.patch(f"/pins/{uuid.uuid4()}", json={"name": "X"})
        assert response.status_code == 401

    def test_missing_pin_is_404(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.patch(f"/pins/{uuid.uuid4()}", headers=auth_headers, json={"name": "X"})
        assert response.status_code == 404
        assert response.json() == {"detail": "Pin not found", "code": "pin_not_found"}

    def test_unknown_field_is_422(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        pin_id = self._create_pin(client, auth_headers)

        response = client.patch(
            f"/pins/{pin_id}",
            headers=auth_headers,
            json={"location": {"latitude": 1, "longitude": 1}},
        )
        assert response.status_code == 422

    def test_explicit_null_add_tags_is_422(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        pin_id = self._create_pin(client, auth_headers)

        response = client.patch(f"/pins/{pin_id}", headers=auth_headers, json={"add_tags": None})
        assert response.status_code == 422

    def test_explicit_null_remove_tag_ids_is_422(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        pin_id = self._create_pin(client, auth_headers)

        response = client.patch(
            f"/pins/{pin_id}", headers=auth_headers, json={"remove_tag_ids": None}
        )
        assert response.status_code == 422

    def test_name_over_max_length_is_422(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        pin_id = self._create_pin(client, auth_headers)

        response = client.patch(f"/pins/{pin_id}", headers=auth_headers, json={"name": "あ" * 51})
        assert response.status_code == 422

    def test_empty_body_returns_200_unchanged(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        pin_id = self._create_pin(client, auth_headers, name="元の名前")

        response = client.patch(f"/pins/{pin_id}", headers=auth_headers, json={})

        assert response.status_code == 200
        assert response.json()["name"] == "元の名前"

    def test_tag_limit_exceeded_returns_409_with_code(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        pin_id = self._create_pin(client, auth_headers)
        first = client.patch(
            f"/pins/{pin_id}",
            headers=auth_headers,
            json={"add_tags": [f"tag{i}" for i in range(10)]},
        )
        assert first.status_code == 200

        response = client.patch(
            f"/pins/{pin_id}", headers=auth_headers, json={"add_tags": ["overflow"]}
        )

        assert response.status_code == 409
        assert response.json()["code"] == "tag_limit_exceeded"

    def test_response_matches_get_pin(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        pin_id = self._create_pin(client, auth_headers)

        patched = client.patch(
            f"/pins/{pin_id}", headers=auth_headers, json={"name": "更新後", "memo": "メモ"}
        )
        fetched = client.get(f"/pins/{pin_id}", headers=auth_headers)

        assert patched.status_code == 200
        assert patched.json() == fetched.json()
