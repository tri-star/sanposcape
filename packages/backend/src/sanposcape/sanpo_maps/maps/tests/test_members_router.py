"""地図のメンバーの一覧・外す・抜ける（`GET /sanpo-maps/{id}/members`・
`DELETE /sanpo-maps/{id}/members/{user_id}`, ADR-009 決定38）。
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from sanposcape.auth.tokens import create_access_token
from sanposcape.config import Settings
from sanposcape.sanpo_maps.conftest import create_pin_with_tags, make_sanpo_map, make_user
from sanposcape.sanpo_maps.models import Pin, PinTag, SanpoMapMember
from sanposcape.users.models import User


def add_member(
    db_session: Session,
    *,
    sanpo_map_id: uuid.UUID,
    user_id: uuid.UUID,
    role: str = "editor",
    joined_at: datetime | None = None,
) -> None:
    member = SanpoMapMember(sanpo_map_id=sanpo_map_id, user_id=user_id, role=role)
    if joined_at is not None:
        member.created_at = joined_at
    db_session.add(member)
    db_session.commit()


def headers_for(user: User, settings: Settings) -> dict[str, str]:
    token, _ = create_access_token(user_id=user.id, settings=settings)
    return {"Authorization": f"Bearer {token}"}


def member_ids(db_session: Session, sanpo_map_id: uuid.UUID) -> set[uuid.UUID]:
    db_session.expire_all()
    return set(
        db_session.scalars(
            select(SanpoMapMember.user_id).where(SanpoMapMember.sanpo_map_id == sanpo_map_id)
        )
    )


class TestListSanpoMapMembers:
    def test_requires_authentication(self, sanpo_maps_client: TestClient) -> None:
        """認証ヘッダーが無ければ 401。"""
        response = sanpo_maps_client.get(f"/sanpo-maps/{uuid.uuid4()}/members")
        assert response.status_code == 401

    def test_owner_sees_members_in_order(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """owner が一覧を取ると、owner → 参加日時の古い順に、表示名・役割・参加日時だけが返る
        （メールアドレス・プロフィール画像は返さない。ポリシー 1-8）。
        """
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        now = datetime.now(UTC)
        later = make_user(db_session, subject="later")
        earlier = make_user(db_session, subject="earlier")
        add_member(
            db_session, sanpo_map_id=sanpo_map_id, user_id=later.id, joined_at=now + timedelta(1)
        )
        add_member(db_session, sanpo_map_id=sanpo_map_id, user_id=earlier.id, joined_at=now)

        response = sanpo_maps_client.get(
            f"/sanpo-maps/{sanpo_map_id}/members", headers=auth_headers
        )

        assert response.status_code == 200
        items = response.json()["items"]
        assert [item["user_id"] for item in items] == [
            str(authenticated_user.id),
            str(earlier.id),
            str(later.id),
        ]
        assert [item["role"] for item in items] == ["owner", "editor", "editor"]
        assert items[1]["display_name"] == "earlier"
        assert set(items[0]) == {"user_id", "display_name", "role", "joined_at"}

    def test_editor_can_list(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """editor も同じ一覧を取れる。"""
        owner = make_user(db_session, subject="owner")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        add_member(db_session, sanpo_map_id=sanpo_map_id, user_id=authenticated_user.id)

        response = sanpo_maps_client.get(
            f"/sanpo-maps/{sanpo_map_id}/members", headers=auth_headers
        )

        assert response.status_code == 200
        assert [item["role"] for item in response.json()["items"]] == ["owner", "editor"]

    def test_display_name_null_when_unset(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """表示名が未設定の利用者は display_name が null で返る（mobile が「メンバー」と出す）。"""
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        nameless = make_user(db_session, subject="nameless")
        nameless.display_name = None
        db_session.commit()
        add_member(db_session, sanpo_map_id=sanpo_map_id, user_id=nameless.id)

        response = sanpo_maps_client.get(
            f"/sanpo-maps/{sanpo_map_id}/members", headers=auth_headers
        )

        assert response.json()["items"][1]["display_name"] is None

    def test_non_member_gets_404(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        db_session: Session,
    ) -> None:
        """他人の地図の一覧は、存在しない地図と区別せず 404（sanpo_map_not_found）。"""
        owner = make_user(db_session, subject="owner")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)

        response = sanpo_maps_client.get(
            f"/sanpo-maps/{sanpo_map_id}/members", headers=auth_headers
        )

        assert response.status_code == 404
        assert response.json()["code"] == "sanpo_map_not_found"


class TestRemoveSanpoMapMember:
    def test_requires_authentication(self, sanpo_maps_client: TestClient) -> None:
        """認証ヘッダーが無ければ 401。"""
        response = sanpo_maps_client.delete(f"/sanpo-maps/{uuid.uuid4()}/members/{uuid.uuid4()}")
        assert response.status_code == 401

    def test_owner_removes_editor_and_keeps_their_pins(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """owner が editor を外すとメンバーの行だけが消え、その editor が追加したピンとタグは
        地図に残る（ADR-009 決定38）。
        """
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        editor = make_user(db_session, subject="editor")
        add_member(db_session, sanpo_map_id=sanpo_map_id, user_id=editor.id)
        pin_id = create_pin_with_tags(
            db_session, user_id=editor.id, sanpo_map_id=sanpo_map_id, tags=[("カフェ", 0)]
        )

        response = sanpo_maps_client.delete(
            f"/sanpo-maps/{sanpo_map_id}/members/{editor.id}", headers=auth_headers
        )

        assert response.status_code == 204
        assert member_ids(db_session, sanpo_map_id) == {authenticated_user.id}
        assert db_session.get(Pin, pin_id) is not None
        assert db_session.scalars(select(PinTag).where(PinTag.pin_id == pin_id)).all() != []

    def test_editor_leaves(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """editor が自分の ID を指定すると地図から抜け、以後その地図は 404 になる。"""
        owner = make_user(db_session, subject="owner")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        add_member(db_session, sanpo_map_id=sanpo_map_id, user_id=authenticated_user.id)

        response = sanpo_maps_client.delete(
            f"/sanpo-maps/{sanpo_map_id}/members/{authenticated_user.id}", headers=auth_headers
        )

        assert response.status_code == 204
        assert member_ids(db_session, sanpo_map_id) == {owner.id}
        again = sanpo_maps_client.get(f"/sanpo-maps/{sanpo_map_id}/members", headers=auth_headers)
        assert again.status_code == 404

    def test_owner_cannot_leave(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """owner が自分を指定すると 409（owner_cannot_leave）で、何も消えない。"""
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)

        response = sanpo_maps_client.delete(
            f"/sanpo-maps/{sanpo_map_id}/members/{authenticated_user.id}", headers=auth_headers
        )

        assert response.status_code == 409
        assert response.json() == {
            "detail": "Owner cannot leave the sanpo map",
            "code": "owner_cannot_leave",
        }
        assert member_ids(db_session, sanpo_map_id) == {authenticated_user.id}

    def test_editor_cannot_remove_others(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """editor が他のメンバー（owner を含む）を指定すると 403 で、何も消えない。"""
        owner = make_user(db_session, subject="owner")
        other = make_user(db_session, subject="other-editor")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        add_member(db_session, sanpo_map_id=sanpo_map_id, user_id=authenticated_user.id)
        add_member(db_session, sanpo_map_id=sanpo_map_id, user_id=other.id)

        for target in (other.id, owner.id):
            response = sanpo_maps_client.delete(
                f"/sanpo-maps/{sanpo_map_id}/members/{target}", headers=auth_headers
            )
            assert response.status_code == 403

        assert member_ids(db_session, sanpo_map_id) == {owner.id, authenticated_user.id, other.id}

    def test_owner_targets_non_member_gets_member_not_found(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """owner が member でない相手（存在しない ID も）を指定すると 404
        （sanpo_map_member_not_found）。
        """
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        stranger = make_user(db_session, subject="stranger")

        for target in (stranger.id, uuid.uuid4()):
            response = sanpo_maps_client.delete(
                f"/sanpo-maps/{sanpo_map_id}/members/{target}", headers=auth_headers
            )
            assert response.status_code == 404
            assert response.json()["code"] == "sanpo_map_member_not_found"

    def test_non_member_caller_gets_map_not_found(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        db_session: Session,
        test_settings: Settings,
    ) -> None:
        """member でない人が呼ぶと、対象が誰でも 404（sanpo_map_not_found）で、地図の存在も
        メンバーの有無も分からない。
        """
        owner = make_user(db_session, subject="owner")
        editor = make_user(db_session, subject="editor")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        add_member(db_session, sanpo_map_id=sanpo_map_id, user_id=editor.id)

        response = sanpo_maps_client.delete(
            f"/sanpo-maps/{sanpo_map_id}/members/{editor.id}", headers=auth_headers
        )

        assert response.status_code == 404
        assert response.json()["code"] == "sanpo_map_not_found"
        assert member_ids(db_session, sanpo_map_id) == {owner.id, editor.id}
        # 外された・抜けた本人の再送も同じ 404（非冪等）。
        headers = headers_for(editor, test_settings)
        assert (
            sanpo_maps_client.delete(
                f"/sanpo-maps/{sanpo_map_id}/members/{editor.id}", headers=headers
            ).status_code
            == 204
        )
        again = sanpo_maps_client.delete(
            f"/sanpo-maps/{sanpo_map_id}/members/{editor.id}", headers=headers
        )
        assert again.status_code == 404
        assert again.json()["code"] == "sanpo_map_not_found"
