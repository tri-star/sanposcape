"""地図への招待リンク（SS-250, ADR-009 決定39）の API。"""

import uuid
from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from sanposcape.auth.tokens import create_access_token
from sanposcape.config import Settings
from sanposcape.main import app
from sanposcape.sanpo_maps.conftest import make_sanpo_map, make_user
from sanposcape.sanpo_maps.exceptions import FeatureDisabledError
from sanposcape.sanpo_maps.invitations.dependencies import require_map_invitation_enabled
from sanposcape.sanpo_maps.invitations.purge import purge_stale_invitations
from sanposcape.sanpo_maps.invitations.service import (
    SANPO_MAP_ACTIVE_INVITATION_LIMIT,
    SANPO_MAP_MEMBER_LIMIT,
    hash_invitation_token,
)
from sanposcape.sanpo_maps.models import SanpoMapInvitation, SanpoMapMember
from sanposcape.users.models import User


@pytest.fixture(autouse=True)
def map_invitation_enabled() -> Generator[None, None, None]:
    """既定はフラグ ON。OFF の振る舞いは `disable_map_invitation` で確かめる。"""
    app.dependency_overrides[require_map_invitation_enabled] = lambda: None
    yield
    app.dependency_overrides.pop(require_map_invitation_enabled, None)


def disable_map_invitation() -> None:
    def _raise() -> None:
        raise FeatureDisabledError()

    app.dependency_overrides[require_map_invitation_enabled] = _raise


def headers_for(user: User, settings: Settings) -> dict[str, str]:
    token, _ = create_access_token(user_id=user.id, settings=settings)
    return {"Authorization": f"Bearer {token}"}


def create_invitation(client: TestClient, sanpo_map_id: uuid.UUID, headers: dict[str, str]) -> dict:
    response = client.post(f"/sanpo-maps/{sanpo_map_id}/invitations", headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def add_editor(db_session: Session, *, sanpo_map_id: uuid.UUID, user_id: uuid.UUID) -> None:
    db_session.add(SanpoMapMember(sanpo_map_id=sanpo_map_id, user_id=user_id, role="editor"))
    db_session.commit()


class TestCreateInvitation:
    def test_owner_creates_link_and_only_hash_is_stored(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """owner が発行すると、トークンと `<招待ページ>#<token>` の URL が返り、
        DB にはハッシュだけが残る。
        """
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)

        body = create_invitation(sanpo_maps_client, sanpo_map_id, auth_headers)

        assert body["url"].endswith(f"/i/#{body['token']}")
        row = db_session.scalars(select(SanpoMapInvitation)).one()
        assert row.token_hash == hash_invitation_token(body["token"])
        assert body["token"] not in row.token_hash
        expires_at = datetime.fromisoformat(body["expires_at"])
        assert timedelta(days=6) < expires_at - datetime.now(UTC) <= timedelta(days=7)

    def test_editor_cannot_create(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """editor は招待できない（403）。非メンバーは 404。"""
        owner = make_user(db_session, subject="owner")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        other_map_id = make_sanpo_map(
            db_session, owner_user_id=make_user(db_session, subject="x").id
        )
        add_editor(db_session, sanpo_map_id=sanpo_map_id, user_id=authenticated_user.id)

        editor = sanpo_maps_client.post(
            f"/sanpo-maps/{sanpo_map_id}/invitations", headers=auth_headers
        )
        stranger = sanpo_maps_client.post(
            f"/sanpo-maps/{other_map_id}/invitations", headers=auth_headers
        )

        assert editor.status_code == 403
        assert stranger.status_code == 404

    def test_active_link_limit(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """有効なリンクが上限に達すると 409 invitation_limit_exceeded。取り消せばまた作れる。"""
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        created = [
            create_invitation(sanpo_maps_client, sanpo_map_id, auth_headers)
            for _ in range(SANPO_MAP_ACTIVE_INVITATION_LIMIT)
        ]

        over = sanpo_maps_client.post(
            f"/sanpo-maps/{sanpo_map_id}/invitations", headers=auth_headers
        )
        assert over.status_code == 409
        assert over.json()["code"] == "invitation_limit_exceeded"

        revoked = sanpo_maps_client.delete(
            f"/sanpo-maps/{sanpo_map_id}/invitations/{created[0]['id']}", headers=auth_headers
        )
        assert revoked.status_code == 204
        create_invitation(sanpo_maps_client, sanpo_map_id, auth_headers)

    def test_member_limit(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """メンバーが上限（owner を含む）なら発行も 409 member_limit_reached。"""
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        for index in range(SANPO_MAP_MEMBER_LIMIT - 1):
            add_editor(
                db_session,
                sanpo_map_id=sanpo_map_id,
                user_id=make_user(db_session, subject=f"m{index}").id,
            )

        response = sanpo_maps_client.post(
            f"/sanpo-maps/{sanpo_map_id}/invitations", headers=auth_headers
        )

        assert response.status_code == 409
        assert response.json()["code"] == "member_limit_reached"

    def test_disabled_flag_returns_403(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """フラグが OFF なら発行は 403 feature_disabled（一覧・取り消しはガードしない）。"""
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        disable_map_invitation()

        created = sanpo_maps_client.post(
            f"/sanpo-maps/{sanpo_map_id}/invitations", headers=auth_headers
        )
        listed = sanpo_maps_client.get(
            f"/sanpo-maps/{sanpo_map_id}/invitations", headers=auth_headers
        )

        assert created.status_code == 403
        assert created.json()["code"] == "feature_disabled"
        assert listed.status_code == 200


class TestListAndRevoke:
    def test_list_returns_only_active_links_without_token(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """一覧は有効なものだけで、トークンを返さない。取り消し済みは出ない。"""
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        first = create_invitation(sanpo_maps_client, sanpo_map_id, auth_headers)
        second = create_invitation(sanpo_maps_client, sanpo_map_id, auth_headers)
        sanpo_maps_client.delete(
            f"/sanpo-maps/{sanpo_map_id}/invitations/{first['id']}", headers=auth_headers
        )

        response = sanpo_maps_client.get(
            f"/sanpo-maps/{sanpo_map_id}/invitations", headers=auth_headers
        )

        items = response.json()["items"]
        assert [item["id"] for item in items] == [second["id"]]
        assert set(items[0]) == {"id", "created_at", "expires_at"}

    def test_revoke_inactive_is_404(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """取り消し済み・存在しないリンクの取り消しは 404 invitation_not_found。"""
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        created = create_invitation(sanpo_maps_client, sanpo_map_id, auth_headers)
        url = f"/sanpo-maps/{sanpo_map_id}/invitations/{created['id']}"
        assert sanpo_maps_client.delete(url, headers=auth_headers).status_code == 204

        again = sanpo_maps_client.delete(url, headers=auth_headers)
        missing = sanpo_maps_client.delete(
            f"/sanpo-maps/{sanpo_map_id}/invitations/{uuid.uuid4()}", headers=auth_headers
        )

        assert again.status_code == 404
        assert again.json()["code"] == "invitation_not_found"
        assert missing.status_code == 404


class TestPreviewAndAccept:
    def test_guest_preview_shows_map_and_inviter(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """サインインしていない人にも、地図の名前・アイコン・招待した人の表示名・期限を返す。"""
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        created = create_invitation(sanpo_maps_client, sanpo_map_id, auth_headers)

        response = sanpo_maps_client.post("/invitations/preview", json={"token": created["token"]})

        assert response.status_code == 200
        body = response.json()
        assert body["sanpo_map"] == {"name": "テスト地図", "icon": "pin"}
        assert body["inviter_display_name"] == authenticated_user.display_name
        assert body["membership"] == "none"
        assert body["sanpo_map_id"] is None

    def test_accept_adds_editor_and_consumes_link(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
        test_settings: Settings,
    ) -> None:
        """受諾すると editor になり、同じリンクは他の人に使えない（1リンク1人）。
        本人の再送は 200（冪等）。
        """
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        token = create_invitation(sanpo_maps_client, sanpo_map_id, auth_headers)["token"]
        guest = headers_for(make_user(db_session, subject="guest"), test_settings)
        other = headers_for(make_user(db_session, subject="other"), test_settings)

        accepted = sanpo_maps_client.post(
            "/invitations/accept", json={"token": token}, headers=guest
        )
        assert accepted.status_code == 200
        assert accepted.json()["id"] == str(sanpo_map_id)
        assert accepted.json()["role"] == "editor"

        reused = sanpo_maps_client.post("/invitations/accept", json={"token": token}, headers=other)
        assert reused.status_code == 404
        assert reused.json()["code"] == "invitation_not_found"
        preview = sanpo_maps_client.post("/invitations/preview", json={"token": token})
        assert preview.status_code == 404

    def test_existing_member_accept_does_not_consume_link(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
        test_settings: Settings,
    ) -> None:
        """すでにメンバー（owner 自身を含む）が受諾しても 200 で、リンクは残る。
        preview は member と地図 ID を返す。
        """
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        token = create_invitation(sanpo_maps_client, sanpo_map_id, auth_headers)["token"]

        preview = sanpo_maps_client.post(
            "/invitations/preview", json={"token": token}, headers=auth_headers
        )
        accepted = sanpo_maps_client.post(
            "/invitations/accept", json={"token": token}, headers=auth_headers
        )
        guest = headers_for(make_user(db_session, subject="guest"), test_settings)
        later = sanpo_maps_client.post("/invitations/accept", json={"token": token}, headers=guest)

        assert preview.json()["membership"] == "member"
        assert preview.json()["sanpo_map_id"] == str(sanpo_map_id)
        assert accepted.status_code == 200
        assert accepted.json()["role"] == "owner"
        assert later.status_code == 200

    def test_expired_and_unknown_tokens_are_indistinguishable(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """期限切れと存在しないトークンは、preview・accept とも同じ 404 invitation_not_found。"""
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        token = create_invitation(sanpo_maps_client, sanpo_map_id, auth_headers)["token"]
        row = db_session.scalars(select(SanpoMapInvitation)).one()
        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db_session.commit()

        responses = [
            sanpo_maps_client.post("/invitations/preview", json={"token": token}),
            sanpo_maps_client.post("/invitations/preview", json={"token": "x" * 43}),
            sanpo_maps_client.post(
                "/invitations/accept", json={"token": token}, headers=auth_headers
            ),
        ]

        assert [r.status_code for r in responses] == [404, 404, 404]
        assert {r.json()["code"] for r in responses} == {"invitation_not_found"}

    def test_accept_requires_sign_in_and_member_limit(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
        test_settings: Settings,
    ) -> None:
        """受諾はサインイン必須（401）。メンバーが上限なら 409 member_limit_reached で、
        リンクは残る。
        """
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        token = create_invitation(sanpo_maps_client, sanpo_map_id, auth_headers)["token"]
        for index in range(SANPO_MAP_MEMBER_LIMIT - 1):
            add_editor(
                db_session,
                sanpo_map_id=sanpo_map_id,
                user_id=make_user(db_session, subject=f"m{index}").id,
            )
        guest = headers_for(make_user(db_session, subject="guest"), test_settings)

        unauthenticated = sanpo_maps_client.post("/invitations/accept", json={"token": token})
        full = sanpo_maps_client.post("/invitations/accept", json={"token": token}, headers=guest)

        assert unauthenticated.status_code == 401
        assert full.status_code == 409
        assert full.json()["code"] == "member_limit_reached"
        db_session.expire_all()
        assert db_session.scalars(select(SanpoMapInvitation)).one().accepted_at is None

    def test_disabled_flag_blocks_preview_and_accept(
        self, sanpo_maps_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        """フラグが OFF なら preview・accept とも 403 feature_disabled
        （トークンを見る前に返す）。
        """
        disable_map_invitation()
        preview = sanpo_maps_client.post("/invitations/preview", json={"token": "x" * 43})
        accept = sanpo_maps_client.post(
            "/invitations/accept", json={"token": "x" * 43}, headers=auth_headers
        )
        assert [preview.status_code, accept.status_code] == [403, 403]

    def test_token_must_be_base64url(self, sanpo_maps_client: TestClient) -> None:
        """トークンは base64url の文字だけ（それ以外・短すぎるものは 422）。"""
        response = sanpo_maps_client.post("/invitations/preview", json={"token": "short"})
        assert response.status_code == 422


class TestPurgeStale:
    def test_purges_rows_30_days_after_end(
        self,
        sanpo_maps_client: TestClient,
        auth_headers: dict[str, str],
        authenticated_user: User,
        db_session: Session,
    ) -> None:
        """取り消し・期限切れから 30 日を過ぎた行だけを消し、有効な行と 30 日以内の行は残す。"""
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=authenticated_user.id)
        ids = [
            create_invitation(sanpo_maps_client, sanpo_map_id, auth_headers)["id"] for _ in range(3)
        ]
        rows = {str(row.id): row for row in db_session.scalars(select(SanpoMapInvitation))}
        now = datetime.now(UTC)
        rows[ids[0]].revoked_at = now - timedelta(days=31)
        rows[ids[1]].expires_at = now - timedelta(days=29)
        db_session.commit()

        deleted = purge_stale_invitations(db_session, url_base="https://example.test/i/")

        assert deleted == 1
        remaining = {str(row.id) for row in db_session.scalars(select(SanpoMapInvitation))}
        assert remaining == {ids[1], ids[2]}
