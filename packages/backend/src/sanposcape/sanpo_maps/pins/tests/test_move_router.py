import uuid
from dataclasses import dataclass
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from sanposcape.integrations.aws.s3 import FakeObjectStorage
from sanposcape.sanpo_maps.conftest import (
    make_extra_sanpo_map,
    make_sanpo_map,
)
from sanposcape.users.models import User


@dataclass
class _MoveEnv:
    client: TestClient
    storage: FakeObjectStorage
    db: Session
    user: User
    headers: dict[str, str]
    map_a: uuid.UUID
    map_b: uuid.UUID


class TestMovePinRouter:
    """`PATCH /pins/{id}` の `sanpo_map_id`（地図の移動, ADR-009 決定33, SS-175）。"""

    @pytest.fixture
    def env(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        db_session: Session,
        authenticated_user: User,
        auth_headers: dict[str, str],
    ) -> _MoveEnv:
        client, storage = fake_storage_client
        map_a = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        map_b = make_extra_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        return _MoveEnv(
            client=client,
            storage=storage,
            db=db_session,
            user=authenticated_user,
            headers=auth_headers,
            map_a=map_a,
            map_b=map_b,
        )

    @staticmethod
    def _create_pin(env: _MoveEnv, **extra: object) -> str:
        response = env.client.post(
            "/pins",
            headers=env.headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "sanpo_map_id": str(env.map_a),
                "location": {"latitude": 1, "longitude": 2},
                **extra,
            },
        )
        assert response.status_code == 201
        return response.json()["id"]

    def test_explicit_null_sanpo_map_id_is_422(self, env: _MoveEnv) -> None:
        pin_id = self._create_pin(env)
        response = env.client.patch(
            f"/pins/{pin_id}", headers=env.headers, json={"sanpo_map_id": None}
        )
        assert response.status_code == 422

    def test_non_uuid_sanpo_map_id_is_422(self, env: _MoveEnv) -> None:
        pin_id = self._create_pin(env)
        response = env.client.patch(
            f"/pins/{pin_id}", headers=env.headers, json={"sanpo_map_id": "not-a-uuid"}
        )
        assert response.status_code == 422

    def test_location_is_still_rejected(self, env: _MoveEnv) -> None:
        pin_id = self._create_pin(env)
        response = env.client.patch(
            f"/pins/{pin_id}",
            headers=env.headers,
            json={"sanpo_map_id": str(env.map_b), "location": {"latitude": 0, "longitude": 0}},
        )
        assert response.status_code == 422

    def test_unknown_destination_is_404_with_code(self, env: _MoveEnv) -> None:
        pin_id = self._create_pin(env)
        response = env.client.patch(
            f"/pins/{pin_id}", headers=env.headers, json={"sanpo_map_id": str(uuid.uuid4())}
        )
        assert response.status_code == 404
        assert response.json() == {
            "detail": "Sanpo map not found",
            "code": "sanpo_map_not_found",
        }

    def test_missing_pin_wins_over_missing_destination(self, env: _MoveEnv) -> None:
        response = env.client.patch(
            f"/pins/{uuid.uuid4()}",
            headers=env.headers,
            json={"sanpo_map_id": str(uuid.uuid4())},
        )
        assert response.status_code == 404
        assert response.json()["code"] == "pin_not_found"

    def test_moves_pin_and_response_matches_get(self, env: _MoveEnv) -> None:
        pin_id = self._create_pin(env, tags=["たこ焼き"])
        before = env.client.get(f"/pins/{pin_id}", headers=env.headers).json()

        response = env.client.patch(
            f"/pins/{pin_id}", headers=env.headers, json={"sanpo_map_id": str(env.map_b)}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["sanpo_map"]["id"] == str(env.map_b)
        assert body == env.client.get(f"/pins/{pin_id}", headers=env.headers).json()
        assert datetime.fromisoformat(body["updated_at"]) > datetime.fromisoformat(
            before["updated_at"]
        )
        assert body["tags"] == before["tags"]
        assert body["created_by_user_id"] == before["created_by_user_id"]
        assert body["client_pin_id"] == before["client_pin_id"]
        assert body["created_at"] == before["created_at"]

    def test_same_map_id_is_a_noop(self, env: _MoveEnv) -> None:
        pin_id = self._create_pin(env)
        before = env.client.get(f"/pins/{pin_id}", headers=env.headers).json()
        maps_before = {
            m["id"]: m["updated_at"]
            for m in env.client.get("/sanpo-maps", headers=env.headers).json()["items"]
        }

        response = env.client.patch(
            f"/pins/{pin_id}", headers=env.headers, json={"sanpo_map_id": str(env.map_a)}
        )

        assert response.status_code == 200
        assert response.json() == before
        maps_after = {
            m["id"]: m["updated_at"]
            for m in env.client.get("/sanpo-maps", headers=env.headers).json()["items"]
        }
        assert maps_after == maps_before

    def test_moves_with_other_fields_together(self, env: _MoveEnv) -> None:
        pin_id = self._create_pin(env, name="元")

        response = env.client.patch(
            f"/pins/{pin_id}",
            headers=env.headers,
            json={"name": "新", "add_tags": ["公園"], "sanpo_map_id": str(env.map_b)},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "新"
        assert [t["label"] for t in body["tags"]] == ["公園"]
        assert body["sanpo_map"]["id"] == str(env.map_b)

    def test_tag_limit_409_does_not_move(self, env: _MoveEnv) -> None:
        pin_id = self._create_pin(env, tags=[f"tag{i}" for i in range(10)])

        response = env.client.patch(
            f"/pins/{pin_id}",
            headers=env.headers,
            json={"add_tags": ["overflow"], "sanpo_map_id": str(env.map_b)},
        )

        assert response.status_code == 409
        assert response.json()["code"] == "tag_limit_exceeded"
        assert env.client.get(f"/pins/{pin_id}", headers=env.headers).json()["sanpo_map"][
            "id"
        ] == str(env.map_a)

    def test_listing_counts_and_tags_follow_the_move(self, env: _MoveEnv) -> None:
        pin_id = self._create_pin(env, tags=["公園"])
        moved = env.client.patch(
            f"/pins/{pin_id}", headers=env.headers, json={"sanpo_map_id": str(env.map_b)}
        )
        assert moved.status_code == 200

        def _ids(map_id: uuid.UUID) -> list[str]:
            response = env.client.get(
                "/pins", headers=env.headers, params={"sanpo_map_id": str(map_id)}
            )
            assert response.status_code == 200
            return [item["id"] for item in response.json()["items"]]

        assert _ids(env.map_a) == []
        assert _ids(env.map_b) == [pin_id]

        maps = env.client.get(
            "/sanpo-maps", headers=env.headers, params={"expand": "pin_count"}
        ).json()["items"]
        counts = {m["id"]: m["pin_count"] for m in maps}
        assert counts[str(env.map_a)] == 0
        assert counts[str(env.map_b)] == 1

        def _tag_labels(map_id: uuid.UUID) -> list[str]:
            response = env.client.get(f"/sanpo-maps/{map_id}/tags", headers=env.headers)
            return [item["label"] for item in response.json()["items"]]

        assert _tag_labels(env.map_a) == []
        assert _tag_labels(env.map_b) == ["公園"]

    def test_moves_destination_map_to_the_front_of_recent_maps(self, env: _MoveEnv) -> None:
        # 既定地図は先頭固定なので、既定でない2つの地図で並びを確認する。
        map_c = make_extra_sanpo_map(env.db, owner_user_id=env.user.id, name="C")
        pin_id = self._create_pin(env)
        order_before = [
            m["id"] for m in env.client.get("/sanpo-maps", headers=env.headers).json()["items"]
        ]
        assert order_before.index(str(map_c)) < order_before.index(str(env.map_b))

        response = env.client.patch(
            f"/pins/{pin_id}", headers=env.headers, json={"sanpo_map_id": str(env.map_b)}
        )

        assert response.status_code == 200
        order_after = [
            m["id"] for m in env.client.get("/sanpo-maps", headers=env.headers).json()["items"]
        ]
        assert order_after.index(str(env.map_b)) < order_after.index(str(map_c))
