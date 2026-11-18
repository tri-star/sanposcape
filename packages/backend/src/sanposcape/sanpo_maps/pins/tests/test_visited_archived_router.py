import uuid
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from sanposcape.integrations.aws.s3 import FakeObjectStorage
from sanposcape.sanpo_maps.conftest import (
    make_sanpo_map,
)
from sanposcape.users.models import User


class TestPinVisitedAndArchived:
    """`visited` / `archived`（SS-173, ADR-009 決定32）の router テスト。

    権限の行列は `TestPinEditPermissionMatrix` にある。ここでは契約（既定値・null・フィルタ・
    `updated_at`・原子性）を確認する。
    """

    def _post(
        self, client: TestClient, headers: dict[str, str], **extra: object
    ) -> dict[str, object]:
        payload: dict[str, object] = {
            "client_pin_id": str(uuid.uuid4()),
            "location": {"latitude": 0, "longitude": 0},
            **extra,
        }
        response = client.post("/pins", headers=headers, json=payload)
        assert response.status_code == 201, response.text
        return response.json()

    def _patch(
        self, client: TestClient, headers: dict[str, str], pin_id: object, body: dict[str, object]
    ) -> dict[str, object]:
        response = client.patch(f"/pins/{pin_id}", headers=headers, json=body)
        assert response.status_code == 200, response.text
        return response.json()

    def _list(
        self, client: TestClient, headers: dict[str, str], sanpo_map_id: object, **params: object
    ) -> dict[str, object]:
        response = client.get(
            "/pins", headers=headers, params={"sanpo_map_id": str(sanpo_map_id), **params}
        )
        assert response.status_code == 200, response.text
        return response.json()

    # --- POST /pins ---

    def test_create_defaults_to_not_visited_and_not_archived(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        body = self._post(client, auth_headers)
        assert body["visited"] is False
        assert body["archived"] is False

    def test_create_with_visited_true(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        body = self._post(client, auth_headers, visited=True)
        assert body["visited"] is True
        fetched = client.get(f"/pins/{body['id']}", headers=auth_headers).json()
        assert fetched["visited"] is True

    def test_create_with_explicit_null_visited_is_422(
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
                "visited": None,
            },
        )
        assert response.status_code == 422

    def test_create_ignores_archived(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        """`PinCreate` は `extra="forbid"` ではないので、`archived` は黙って無視される。"""
        client, _storage = fake_storage_client
        body = self._post(client, auth_headers, archived=True)
        assert body["archived"] is False

    def test_idempotent_resend_returns_existing_visited(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        client_pin_id = str(uuid.uuid4())
        payload = {
            "client_pin_id": client_pin_id,
            "location": {"latitude": 0, "longitude": 0},
            "visited": False,
        }
        first = client.post("/pins", headers=auth_headers, json=payload)
        assert first.status_code == 201

        second = client.post("/pins", headers=auth_headers, json={**payload, "visited": True})

        assert second.status_code == 200
        assert second.json()["visited"] is False

    # --- GET /pins ---

    def test_list_items_have_visited_and_archived(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        pin = self._post(client, auth_headers, visited=True)
        sanpo_map_id = pin["sanpo_map"]["id"]  # type: ignore[index]

        items = self._list(client, auth_headers, sanpo_map_id)["items"]

        assert items[0]["visited"] is True  # type: ignore[index]
        assert items[0]["archived"] is False  # type: ignore[index]

    @pytest.fixture
    def four_pins(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> dict[str, object]:
        """visited × archived の4通りを1件ずつ（作成順 = 古い順）。"""
        client, _storage = fake_storage_client
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        ids: dict[str, str] = {}
        for key, visited, archived in [
            ("unvisited_active", False, False),
            ("unvisited_archived", False, True),
            ("visited_active", True, False),
            ("visited_archived", True, True),
        ]:
            pin = self._post(client, auth_headers, sanpo_map_id=str(sanpo_map_id), visited=visited)
            if archived:
                self._patch(client, auth_headers, pin["id"], {"archived": True})
            ids[key] = str(pin["id"])
        return {"client": client, "map_id": sanpo_map_id, "ids": ids}

    @pytest.mark.parametrize(
        ("params", "expected"),
        [
            ({}, {"unvisited_active", "unvisited_archived", "visited_active", "visited_archived"}),
            ({"archived": "false"}, {"unvisited_active", "visited_active"}),
            ({"archived": "true"}, {"unvisited_archived", "visited_archived"}),
            ({"visited": "false"}, {"unvisited_active", "unvisited_archived"}),
            ({"visited": "true"}, {"visited_active", "visited_archived"}),
            ({"archived": "false", "visited": "false"}, {"unvisited_active"}),
            ({"archived": "true", "visited": "true"}, {"visited_archived"}),
        ],
    )
    def test_list_filters(
        self,
        four_pins: dict[str, object],
        auth_headers: dict[str, str],
        params: dict[str, str],
        expected: set[str],
    ) -> None:
        ids: dict[str, str] = four_pins["ids"]  # type: ignore[assignment]
        body = self._list(four_pins["client"], auth_headers, four_pins["map_id"], **params)  # type: ignore[arg-type]
        assert {item["id"] for item in body["items"]} == {ids[key] for key in expected}  # type: ignore[index]

    def test_list_filter_is_applied_before_limit(
        self,
        four_pins: dict[str, object],
        auth_headers: dict[str, str],
    ) -> None:
        """最新のピンがアーカイブ済みでも、`archived=false&limit=1` は残りの1件を返す。"""
        ids: dict[str, str] = four_pins["ids"]  # type: ignore[assignment]
        client: TestClient = four_pins["client"]  # type: ignore[assignment]
        # 最新（visited_archived）が先頭に来るので、絞り込み前に limit が掛かれば空になる。
        body = self._list(client, auth_headers, four_pins["map_id"], archived="false", limit=1)
        assert [item["id"] for item in body["items"]] == [ids["visited_active"]]  # type: ignore[index]
        assert body["next_cursor"] is not None

        second = self._list(
            client,
            auth_headers,
            four_pins["map_id"],
            archived="false",
            limit=1,
            cursor=body["next_cursor"],
        )
        assert [item["id"] for item in second["items"]] == [ids["unvisited_active"]]  # type: ignore[index]
        assert second["next_cursor"] is None

    def test_list_filter_combines_with_bbox_and_tags(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        client, _storage = fake_storage_client
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        base = {"sanpo_map_id": str(sanpo_map_id)}
        hit = self._post(client, auth_headers, **base, tags=["桜"])
        archived_hit = self._post(client, auth_headers, **base, tags=["桜"])
        self._patch(client, auth_headers, archived_hit["id"], {"archived": True})
        far = self._post(
            client, auth_headers, **base, tags=["桜"], location={"latitude": 10, "longitude": 10}
        )

        body = self._list(
            client,
            auth_headers,
            sanpo_map_id,
            archived="false",
            tags=["桜"],
            min_latitude=-1,
            max_latitude=1,
            min_longitude=-1,
            max_longitude=1,
        )

        ids = {item["id"] for item in body["items"]}  # type: ignore[index]
        assert ids == {hit["id"]}
        assert far["id"] not in ids

    @pytest.mark.parametrize("param", ["archived", "visited"])
    @pytest.mark.parametrize("value", ["null", "abc"])
    def test_list_invalid_bool_filter_is_422(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        param: str,
        value: str,
    ) -> None:
        client, _storage = fake_storage_client
        response = client.get(
            "/pins",
            headers=auth_headers,
            params={"sanpo_map_id": str(uuid.uuid4()), param: value},
        )
        assert response.status_code == 422

    # --- PATCH /pins/{id} ---

    def test_patch_visited_updates_value_and_advances_updated_at(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        pin = self._post(client, auth_headers)

        patched = self._patch(client, auth_headers, pin["id"], {"visited": True})

        assert patched["visited"] is True
        assert patched["archived"] is False
        assert datetime.fromisoformat(str(patched["updated_at"])) > datetime.fromisoformat(
            str(pin["updated_at"])
        )
        assert client.get(f"/pins/{pin['id']}", headers=auth_headers).json() == patched

    def test_patch_same_value_does_not_advance_updated_at(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        pin = self._post(client, auth_headers)
        first = self._patch(client, auth_headers, pin["id"], {"visited": True, "archived": True})

        again = self._patch(client, auth_headers, pin["id"], {"visited": True, "archived": True})

        assert again["updated_at"] == first["updated_at"]

    def test_patch_archived_and_back(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        pin = self._post(client, auth_headers)

        archived = self._patch(client, auth_headers, pin["id"], {"archived": True})
        restored = self._patch(client, auth_headers, pin["id"], {"archived": False})

        assert archived["archived"] is True
        assert restored["archived"] is False

    @pytest.mark.parametrize("field", ["visited", "archived"])
    def test_patch_explicit_null_is_422(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        field: str,
    ) -> None:
        client, _storage = fake_storage_client
        pin = self._post(client, auth_headers)
        response = client.patch(f"/pins/{pin['id']}", headers=auth_headers, json={field: None})
        assert response.status_code == 422

    def test_patch_all_fields_at_once(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        pin = self._post(client, auth_headers, name="元")

        patched = self._patch(
            client,
            auth_headers,
            pin["id"],
            {"name": "新", "add_tags": ["a"], "visited": True, "archived": True},
        )

        assert patched["name"] == "新"
        assert [tag["label"] for tag in patched["tags"]] == ["a"]  # type: ignore[index]
        assert patched["visited"] is True
        assert patched["archived"] is True

    def test_patch_tag_limit_exceeded_rolls_back_visited_and_archived(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        pin = self._post(client, auth_headers, tags=[f"tag{i}" for i in range(10)])

        response = client.patch(
            f"/pins/{pin['id']}",
            headers=auth_headers,
            json={"add_tags": ["overflow"], "visited": True, "archived": True},
        )

        assert response.status_code == 409
        unchanged = client.get(f"/pins/{pin['id']}", headers=auth_headers).json()
        assert unchanged["visited"] is False
        assert unchanged["archived"] is False
