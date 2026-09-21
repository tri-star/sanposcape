from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from sanposcape.sanpo_maps.models import SanpoMapMember
from sanposcape.sanpo_maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.tests.conftest import make_user
from sanposcape.users.models import User


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
