"""自分のメンバーシップの設定（`PATCH /sanpo-maps/{id}/members/me`）と、地図の応答の
`pins_visible`（SS-266）。
"""

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from sanposcape.auth.tokens import create_access_token
from sanposcape.config import Settings
from sanposcape.sanpo_maps.conftest import make_sanpo_map, make_user
from sanposcape.sanpo_maps.models import SanpoMap, SanpoMapMember
from sanposcape.users.models import User


def add_editor(db_session: Session, *, sanpo_map_id: uuid.UUID, user_id: uuid.UUID) -> None:
    db_session.add(SanpoMapMember(sanpo_map_id=sanpo_map_id, user_id=user_id, role="editor"))
    db_session.commit()


def headers_for(user: User, settings: Settings) -> dict[str, str]:
    token, _ = create_access_token(user_id=user.id, settings=settings)
    return {"Authorization": f"Bearer {token}"}


def stored_pins_visible(
    db_session: Session, *, sanpo_map_id: uuid.UUID, user_id: uuid.UUID
) -> bool:
    db_session.expire_all()
    value = db_session.scalars(
        select(SanpoMapMember.pins_visible).where(
            SanpoMapMember.sanpo_map_id == sanpo_map_id, SanpoMapMember.user_id == user_id
        )
    ).one()
    return value


def listed_pins_visible(
    client: TestClient, headers: dict[str, str], sanpo_map_id: uuid.UUID
) -> bool:
    response = client.get("/sanpo-maps", headers=headers)
    assert response.status_code == 200
    item = next(i for i in response.json()["items"] if i["id"] == str(sanpo_map_id))
    return item["pins_visible"]


class TestPinsVisibleInResponses:
    def test_list_returns_true_by_default(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """何も選んでいない地図は、一覧で `pins_visible: true` になること（既定は表示）。"""
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)

        assert listed_pins_visible(sanpo_maps_client, auth_headers, sanpo_map_id) is True

    def test_create_returns_true(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        """地図を作った応答の `pins_visible` は true であること。"""
        response = sanpo_maps_client.post(
            "/sanpo-maps", json={"name": "新しい地図"}, headers=auth_headers
        )

        assert response.status_code == 201
        assert response.json()["pins_visible"] is True

    def test_update_map_returns_own_value(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """非表示にした地図の名前を変えると、応答の `pins_visible` は自分の値（false）のまま
        であること。
        """
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        sanpo_maps_client.patch(
            f"/sanpo-maps/{sanpo_map_id}/members/me",
            json={"pins_visible": False},
            headers=auth_headers,
        )

        response = sanpo_maps_client.patch(
            f"/sanpo-maps/{sanpo_map_id}", json={"name": "改名"}, headers=auth_headers
        )

        assert response.status_code == 200
        assert response.json()["pins_visible"] is False


class TestUpdateMyMembership:
    def test_requires_authentication(self, sanpo_maps_client: TestClient) -> None:
        """認証ヘッダーが無ければ 401。"""
        response = sanpo_maps_client.patch(
            f"/sanpo-maps/{uuid.uuid4()}/members/me", json={"pins_visible": False}
        )
        assert response.status_code == 401

    def test_owner_hides_and_shows_again(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """owner が false を送ると 200 で更新後の地図が返り、DB と一覧に残る。true で元に戻る
        こと。
        """
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        url = f"/sanpo-maps/{sanpo_map_id}/members/me"

        hidden = sanpo_maps_client.patch(url, json={"pins_visible": False}, headers=auth_headers)

        assert hidden.status_code == 200
        assert hidden.json()["id"] == str(sanpo_map_id)
        assert hidden.json()["role"] == "owner"
        assert hidden.json()["pins_visible"] is False
        assert (
            stored_pins_visible(
                db_session, sanpo_map_id=sanpo_map_id, user_id=authenticated_user.id
            )
            is False
        )
        assert listed_pins_visible(sanpo_maps_client, auth_headers, sanpo_map_id) is False

        shown = sanpo_maps_client.patch(url, json={"pins_visible": True}, headers=auth_headers)

        assert shown.status_code == 200
        assert shown.json()["pins_visible"] is True
        assert listed_pins_visible(sanpo_maps_client, auth_headers, sanpo_map_id) is True

    def test_choice_is_independent_per_member(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
        test_settings: Settings,
    ) -> None:
        """共有地図で owner が非表示にしても、editor の一覧では表示のままであること。editor が
        非表示にしても owner の値は変わらないこと（地図の属性にしない理由。SS-266）。
        """
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        editor = make_user(db_session, subject="editor")
        add_editor(db_session, sanpo_map_id=sanpo_map_id, user_id=editor.id)
        editor_headers = headers_for(editor, test_settings)
        url = f"/sanpo-maps/{sanpo_map_id}/members/me"

        sanpo_maps_client.patch(url, json={"pins_visible": False}, headers=auth_headers)

        assert listed_pins_visible(sanpo_maps_client, editor_headers, sanpo_map_id) is True

        response = sanpo_maps_client.patch(
            url, json={"pins_visible": False}, headers=editor_headers
        )
        sanpo_maps_client.patch(url, json={"pins_visible": True}, headers=auth_headers)

        assert response.status_code == 200
        assert response.json()["role"] == "editor"
        assert listed_pins_visible(sanpo_maps_client, editor_headers, sanpo_map_id) is False
        assert listed_pins_visible(sanpo_maps_client, auth_headers, sanpo_map_id) is True

    def test_does_not_touch_map_updated_at(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """切り替えても地図の `updated_at` は変わらないこと（一覧の並び順が動かない）。"""
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        before = db_session.get(SanpoMap, sanpo_map_id)
        assert before is not None
        updated_at = before.updated_at

        sanpo_maps_client.patch(
            f"/sanpo-maps/{sanpo_map_id}/members/me",
            json={"pins_visible": False},
            headers=auth_headers,
        )

        db_session.expire_all()
        after = db_session.get(SanpoMap, sanpo_map_id)
        assert after is not None
        assert after.updated_at == updated_at

    def test_empty_body_changes_nothing(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """`{}` は 200 で今の値を返し、DB の値を変えないこと。"""
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        url = f"/sanpo-maps/{sanpo_map_id}/members/me"
        sanpo_maps_client.patch(url, json={"pins_visible": False}, headers=auth_headers)

        response = sanpo_maps_client.patch(url, json={}, headers=auth_headers)

        assert response.status_code == 200
        assert response.json()["pins_visible"] is False
        assert (
            stored_pins_visible(
                db_session, sanpo_map_id=sanpo_map_id, user_id=authenticated_user.id
            )
            is False
        )

    def test_non_member_is_404_and_owner_value_is_unchanged(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        db_session: Session,
    ) -> None:
        """member でない地図に送ると 404 になり、持ち主の値は変わらないこと。"""
        owner = make_user(db_session, subject="other-owner")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)

        response = sanpo_maps_client.patch(
            f"/sanpo-maps/{sanpo_map_id}/members/me",
            json={"pins_visible": False},
            headers=auth_headers,
        )

        assert response.status_code == 404
        assert stored_pins_visible(db_session, sanpo_map_id=sanpo_map_id, user_id=owner.id) is True

    def test_unknown_map_is_404(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        """存在しない地図 ID は 404。"""
        response = sanpo_maps_client.patch(
            f"/sanpo-maps/{uuid.uuid4()}/members/me",
            json={"pins_visible": False},
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_explicit_null_is_422(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """`pins_visible: null` は 422 で、値は変わらないこと（省略可・null 不可）。"""
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)

        response = sanpo_maps_client.patch(
            f"/sanpo-maps/{sanpo_map_id}/members/me",
            json={"pins_visible": None},
            headers=auth_headers,
        )

        assert response.status_code == 422
        assert (
            stored_pins_visible(
                db_session, sanpo_map_id=sanpo_map_id, user_id=authenticated_user.id
            )
            is True
        )

    def test_extra_field_is_422(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """知らないフィールド（例: 地図の属性の `name`）は 422 で、地図の名前は変わらないこと。"""
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)

        response = sanpo_maps_client.patch(
            f"/sanpo-maps/{sanpo_map_id}/members/me",
            json={"name": "改名"},
            headers=auth_headers,
        )

        assert response.status_code == 422
        db_session.expire_all()
        sanpo_map = db_session.get(SanpoMap, sanpo_map_id)
        assert sanpo_map is not None
        assert sanpo_map.name == "テスト地図"
