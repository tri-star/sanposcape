import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from sanposcape.sanpo_maps.conftest import add_pin_tag, create_pin_with_tags, make_user
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.models import SanpoMapMember
from sanposcape.users.models import User


def add_member(
    db_session: Session, *, sanpo_map_id: uuid.UUID, user_id: uuid.UUID, role: str
) -> None:
    db_session.add(SanpoMapMember(sanpo_map_id=sanpo_map_id, user_id=user_id, role=role))
    db_session.commit()


class TestListSanpoMaps:
    def test_requires_authentication(self, sanpo_maps_client: TestClient) -> None:
        response = sanpo_maps_client.get("/sanpo-maps")
        assert response.status_code == 401

    def test_returns_empty_items_when_no_maps(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = sanpo_maps_client.get("/sanpo-maps", headers=auth_headers)
        assert response.status_code == 200
        assert response.json() == {"items": [], "next_cursor": None}

    def test_returns_own_default_map(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        repo = SanpoMapRepository(db_session)
        repo.create_with_owner(
            owner_user_id=authenticated_user.id, name="最初の地図", is_default=True
        )
        db_session.commit()

        response = sanpo_maps_client.get("/sanpo-maps", headers=auth_headers)

        assert response.status_code == 200
        body = response.json()
        assert len(body["items"]) == 1
        item = body["items"][0]
        assert item["name"] == "最初の地図"
        assert item["is_default"] is True
        assert item["role"] == "owner"
        assert item["icon"] == "pin"
        assert body["next_cursor"] is None

    def test_editor_of_others_default_map_sees_is_default_false(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        owner = make_user(db_session, subject="other-owner")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(
            owner_user_id=owner.id, name="他人の地図", is_default=True
        )
        db_session.add(
            SanpoMapMember(sanpo_map_id=sanpo_map.id, user_id=authenticated_user.id, role="editor")
        )
        db_session.commit()

        response = sanpo_maps_client.get("/sanpo-maps", headers=auth_headers)

        assert response.status_code == 200
        item = response.json()["items"][0]
        assert item["is_default"] is False
        assert item["role"] == "editor"

    def test_does_not_return_other_users_maps(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        db_session: Session,
    ) -> None:
        stranger = make_user(db_session, subject="stranger")
        repo = SanpoMapRepository(db_session)
        repo.create_with_owner(owner_user_id=stranger.id, name="他人の地図", is_default=True)
        db_session.commit()

        response = sanpo_maps_client.get("/sanpo-maps", headers=auth_headers)

        assert response.status_code == 200
        assert response.json()["items"] == []


class TestListSanpoMapsExpand:
    def test_pin_count_is_null_without_expand(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        sanpo_maps_client.post("/sanpo-maps", json={"name": "地図"}, headers=auth_headers)

        response = sanpo_maps_client.get("/sanpo-maps", headers=auth_headers)

        assert response.status_code == 200
        assert response.json()["items"][0]["pin_count"] is None

    def test_pin_count_is_zero_with_expand_and_no_pins(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        sanpo_maps_client.post("/sanpo-maps", json={"name": "地図"}, headers=auth_headers)

        response = sanpo_maps_client.get(
            "/sanpo-maps", params={"expand": "pin_count"}, headers=auth_headers
        )

        assert response.status_code == 200
        assert response.json()["items"][0]["pin_count"] == 0

    def test_unknown_expand_value_is_422(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = sanpo_maps_client.get(
            "/sanpo-maps", params={"expand": "unknown"}, headers=auth_headers
        )

        assert response.status_code == 422


class TestCreateSanpoMap:
    def test_requires_authentication(self, sanpo_maps_client: TestClient) -> None:
        response = sanpo_maps_client.post("/sanpo-maps", json={"name": "地図"})
        assert response.status_code == 401

    def test_first_map_is_created_as_default(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = sanpo_maps_client.post(
            "/sanpo-maps", json={"name": "最初の地図"}, headers=auth_headers
        )

        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "最初の地図"
        assert body["is_default"] is True
        assert body["role"] == "owner"
        assert body["pin_count"] is None

    def test_second_map_is_not_default(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        sanpo_maps_client.post("/sanpo-maps", json={"name": "1つ目"}, headers=auth_headers)

        response = sanpo_maps_client.post(
            "/sanpo-maps", json={"name": "2つ目"}, headers=auth_headers
        )

        assert response.status_code == 201
        assert response.json()["is_default"] is False

    def test_icon_is_saved_and_returned(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = sanpo_maps_client.post(
            "/sanpo-maps", json={"name": "地図", "icon": "coffee"}, headers=auth_headers
        )

        assert response.status_code == 201
        assert response.json()["icon"] == "coffee"

    def test_icon_defaults_to_pin(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = sanpo_maps_client.post(
            "/sanpo-maps", json={"name": "地図"}, headers=auth_headers
        )

        assert response.status_code == 201
        assert response.json()["icon"] == "pin"

    @pytest.mark.parametrize("icon", [None, "unknown", "PIN"])
    def test_invalid_icon_is_422(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str], icon: object
    ) -> None:
        response = sanpo_maps_client.post(
            "/sanpo-maps", json={"name": "地図", "icon": icon}, headers=auth_headers
        )
        assert response.status_code == 422

    def test_blank_name_is_422(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = sanpo_maps_client.post("/sanpo-maps", json={"name": "   "}, headers=auth_headers)
        assert response.status_code == 422

    def test_name_over_max_length_is_422(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = sanpo_maps_client.post(
            "/sanpo-maps", json={"name": "あ" * 51}, headers=auth_headers
        )
        assert response.status_code == 422


class TestUpdateSanpoMap:
    def test_owner_can_rename(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(
            owner_user_id=authenticated_user.id, name="旧名", is_default=True
        )
        db_session.commit()

        response = sanpo_maps_client.patch(
            f"/sanpo-maps/{sanpo_map.id}", json={"name": "新名"}, headers=auth_headers
        )

        assert response.status_code == 200
        assert response.json()["name"] == "新名"

    def test_editor_sending_name_is_403(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        owner = make_user(db_session, subject="owner")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=owner.id, name="地図", is_default=True)
        add_member(
            db_session, sanpo_map_id=sanpo_map.id, user_id=authenticated_user.id, role="editor"
        )

        response = sanpo_maps_client.patch(
            f"/sanpo-maps/{sanpo_map.id}", json={"name": "改名"}, headers=auth_headers
        )

        assert response.status_code == 403

    def test_other_users_map_is_404(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str], db_session: Session
    ) -> None:
        stranger = make_user(db_session, subject="stranger")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(
            owner_user_id=stranger.id, name="他人の地図", is_default=True
        )
        db_session.commit()

        response = sanpo_maps_client.patch(
            f"/sanpo-maps/{sanpo_map.id}", json={"name": "改名"}, headers=auth_headers
        )

        assert response.status_code == 404

    def test_empty_body_changes_nothing(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(
            owner_user_id=authenticated_user.id, name="そのまま", is_default=True
        )
        db_session.commit()

        response = sanpo_maps_client.patch(
            f"/sanpo-maps/{sanpo_map.id}", json={}, headers=auth_headers
        )

        assert response.status_code == 200
        assert response.json()["name"] == "そのまま"

    def test_explicit_null_name_is_422(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(
            owner_user_id=authenticated_user.id, name="地図", is_default=True
        )
        db_session.commit()

        response = sanpo_maps_client.patch(
            f"/sanpo-maps/{sanpo_map.id}", json={"name": None}, headers=auth_headers
        )

        assert response.status_code == 422

    def test_extra_field_is_422(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(
            owner_user_id=authenticated_user.id, name="地図", is_default=True
        )
        db_session.commit()

        response = sanpo_maps_client.patch(
            f"/sanpo-maps/{sanpo_map.id}",
            json={"name": "地図", "is_default": True},
            headers=auth_headers,
        )

        assert response.status_code == 422


class TestUpdateSanpoMapIcon:
    def test_owner_can_change_icon_and_it_is_reflected_in_list(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(
            owner_user_id=authenticated_user.id, name="地図", is_default=True
        )
        db_session.commit()

        response = sanpo_maps_client.patch(
            f"/sanpo-maps/{sanpo_map.id}", json={"icon": "cat"}, headers=auth_headers
        )

        assert response.status_code == 200
        body = response.json()
        assert body["icon"] == "cat"
        assert body["name"] == "地図"
        assert body["pin_count"] is None
        listed = sanpo_maps_client.get("/sanpo-maps", headers=auth_headers).json()["items"]
        assert [item["icon"] for item in listed] == ["cat"]

    def test_editor_sending_icon_is_403(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        owner = make_user(db_session, subject="owner")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=owner.id, name="地図", is_default=True)
        add_member(
            db_session, sanpo_map_id=sanpo_map.id, user_id=authenticated_user.id, role="editor"
        )

        response = sanpo_maps_client.patch(
            f"/sanpo-maps/{sanpo_map.id}", json={"icon": "cat"}, headers=auth_headers
        )

        assert response.status_code == 403

    def test_other_users_map_is_404(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str], db_session: Session
    ) -> None:
        stranger = make_user(db_session, subject="stranger")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(
            owner_user_id=stranger.id, name="他人の地図", is_default=True
        )
        db_session.commit()

        response = sanpo_maps_client.patch(
            f"/sanpo-maps/{sanpo_map.id}", json={"icon": "cat"}, headers=auth_headers
        )

        assert response.status_code == 404

    @pytest.mark.parametrize("icon", [None, "unknown"])
    def test_invalid_icon_is_422(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
        icon: object,
    ) -> None:
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(
            owner_user_id=authenticated_user.id, name="地図", is_default=True
        )
        db_session.commit()

        response = sanpo_maps_client.patch(
            f"/sanpo-maps/{sanpo_map.id}", json={"icon": icon}, headers=auth_headers
        )

        assert response.status_code == 422

    def test_changing_icon_does_not_reorder_the_list(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        repo = SanpoMapRepository(db_session)
        default_map, _ = repo.create_with_owner(
            owner_user_id=authenticated_user.id, name="既定", is_default=True
        )
        older, _ = repo.create_with_owner(
            owner_user_id=authenticated_user.id, name="古い", is_default=False
        )
        newer, _ = repo.create_with_owner(
            owner_user_id=authenticated_user.id, name="新しい", is_default=False
        )
        db_session.commit()
        repo.touch(sanpo_map_id=newer.id, now=datetime.now(UTC) + timedelta(hours=1))
        db_session.commit()
        expected_order = [str(default_map.id), str(newer.id), str(older.id)]

        def listed_ids() -> list[str]:
            response = sanpo_maps_client.get("/sanpo-maps", headers=auth_headers)
            return [item["id"] for item in response.json()["items"]]

        assert listed_ids() == expected_order

        response = sanpo_maps_client.patch(
            f"/sanpo-maps/{older.id}", json={"icon": "cat"}, headers=auth_headers
        )

        assert response.status_code == 200
        assert listed_ids() == expected_order


class TestDeleteSanpoMap:
    def test_owner_deletes_then_resend_is_404(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(
            owner_user_id=authenticated_user.id, name="地図", is_default=True
        )
        db_session.commit()

        first = sanpo_maps_client.delete(f"/sanpo-maps/{sanpo_map.id}", headers=auth_headers)
        second = sanpo_maps_client.delete(f"/sanpo-maps/{sanpo_map.id}", headers=auth_headers)

        assert first.status_code == 204
        assert second.status_code == 404

    def test_editor_is_403_and_map_survives(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        owner = make_user(db_session, subject="owner")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(owner_user_id=owner.id, name="地図", is_default=True)
        add_member(
            db_session, sanpo_map_id=sanpo_map.id, user_id=authenticated_user.id, role="editor"
        )

        response = sanpo_maps_client.delete(f"/sanpo-maps/{sanpo_map.id}", headers=auth_headers)

        assert response.status_code == 403
        assert db_session.get(type(sanpo_map), sanpo_map.id) is not None

    def test_other_users_map_is_404_and_map_survives(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str], db_session: Session
    ) -> None:
        stranger = make_user(db_session, subject="stranger")
        repo = SanpoMapRepository(db_session)
        sanpo_map, _ = repo.create_with_owner(
            owner_user_id=stranger.id, name="他人の地図", is_default=True
        )
        db_session.commit()

        response = sanpo_maps_client.delete(f"/sanpo-maps/{sanpo_map.id}", headers=auth_headers)

        assert response.status_code == 404
        assert db_session.get(type(sanpo_map), sanpo_map.id) is not None

    def test_deleting_default_map_promotes_the_next_one(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        default_body = sanpo_maps_client.post(
            "/sanpo-maps", json={"name": "既定"}, headers=auth_headers
        ).json()
        other_body = sanpo_maps_client.post(
            "/sanpo-maps", json={"name": "非既定"}, headers=auth_headers
        ).json()

        delete_response = sanpo_maps_client.delete(
            f"/sanpo-maps/{default_body['id']}", headers=auth_headers
        )
        assert delete_response.status_code == 204

        list_response = sanpo_maps_client.get("/sanpo-maps", headers=auth_headers)
        items = list_response.json()["items"]
        assert items[0]["id"] == other_body["id"]
        assert items[0]["is_default"] is True


class TestListSanpoMapTags:
    def _own_map(self, db_session: Session, user: User) -> uuid.UUID:
        sanpo_map, _ = SanpoMapRepository(db_session).create_with_owner(
            owner_user_id=user.id, name="地図", is_default=True
        )
        db_session.commit()
        return sanpo_map.id

    def test_requires_authentication(self, sanpo_maps_client: TestClient) -> None:
        response = sanpo_maps_client.get(f"/sanpo-maps/{uuid.uuid4()}/tags")
        assert response.status_code == 401

    def test_returns_label_and_pin_count_only(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        map_id = self._own_map(db_session, authenticated_user)
        for _ in range(2):
            create_pin_with_tags(
                db_session, sanpo_map_id=map_id, user_id=authenticated_user.id, tags=[("カフェ", 0)]
            )
        create_pin_with_tags(
            db_session, sanpo_map_id=map_id, user_id=authenticated_user.id, tags=[("公園", 1)]
        )

        response = sanpo_maps_client.get(f"/sanpo-maps/{map_id}/tags", headers=auth_headers)

        assert response.status_code == 200
        assert response.json() == {
            "items": [{"label": "カフェ", "pin_count": 2}, {"label": "公園", "pin_count": 1}]
        }

    def test_map_without_tags_returns_empty_items(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        map_id = self._own_map(db_session, authenticated_user)

        response = sanpo_maps_client.get(f"/sanpo-maps/{map_id}/tags", headers=auth_headers)

        assert response.status_code == 200
        assert response.json() == {"items": []}

    def test_others_map_is_404(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        db_session: Session,
    ) -> None:
        owner = make_user(db_session, subject="owner")
        map_id = self._own_map(db_session, owner)

        response = sanpo_maps_client.get(f"/sanpo-maps/{map_id}/tags", headers=auth_headers)

        assert response.status_code == 404
        assert response.json() == {
            "detail": "Sanpo map not found",
            "code": "sanpo_map_not_found",
        }

    def test_unknown_map_is_404(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = sanpo_maps_client.get(f"/sanpo-maps/{uuid.uuid4()}/tags", headers=auth_headers)

        assert response.status_code == 404
        assert response.json() == {
            "detail": "Sanpo map not found",
            "code": "sanpo_map_not_found",
        }

    def test_non_uuid_map_id_is_422(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = sanpo_maps_client.get("/sanpo-maps/not-a-uuid/tags", headers=auth_headers)
        assert response.status_code == 422

    def test_limit_out_of_range_is_422_and_upper_bound_is_ok(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        map_id = self._own_map(db_session, authenticated_user)
        url = f"/sanpo-maps/{map_id}/tags"

        assert (
            sanpo_maps_client.get(url, params={"limit": 0}, headers=auth_headers).status_code == 422
        )
        assert (
            sanpo_maps_client.get(url, params={"limit": 201}, headers=auth_headers).status_code
            == 422
        )
        assert (
            sanpo_maps_client.get(url, params={"limit": 200}, headers=auth_headers).status_code
            == 200
        )

    def test_default_limit_is_100(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        map_id = self._own_map(db_session, authenticated_user)
        # サービス層の10件上限を通らないよう、Repository 直で 101 種類を INSERT する。
        pin_id = create_pin_with_tags(
            db_session, sanpo_map_id=map_id, user_id=authenticated_user.id
        )
        for i in range(101):
            add_pin_tag(
                db_session, pin_id=pin_id, user_id=authenticated_user.id, label=f"tag{i:03d}"
            )
        db_session.commit()

        response = sanpo_maps_client.get(f"/sanpo-maps/{map_id}/tags", headers=auth_headers)

        assert response.status_code == 200
        assert len(response.json()["items"]) == 100

    def test_editor_member_can_list(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        owner = make_user(db_session, subject="owner")
        map_id = self._own_map(db_session, owner)
        add_member(db_session, sanpo_map_id=map_id, user_id=authenticated_user.id, role="editor")
        create_pin_with_tags(
            db_session, sanpo_map_id=map_id, user_id=owner.id, tags=[("オーナーのタグ", 0)]
        )

        response = sanpo_maps_client.get(f"/sanpo-maps/{map_id}/tags", headers=auth_headers)

        assert response.status_code == 200
        assert response.json() == {"items": [{"label": "オーナーのタグ", "pin_count": 1}]}


class TestRequestSizeLimit:
    def test_oversized_post_body_returns_413(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        oversized_body = b"a" * (16_384 + 1)

        response = sanpo_maps_client.post(
            "/sanpo-maps",
            content=oversized_body,
            headers={**auth_headers, "Content-Type": "application/json"},
        )

        assert response.status_code == 413
