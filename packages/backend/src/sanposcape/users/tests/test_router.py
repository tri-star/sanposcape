import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from sanposcape.auth.models import RefreshToken
from sanposcape.auth.tokens import create_access_token
from sanposcape.config import Settings
from sanposcape.users.models import User


def _create_session(auth_client: TestClient, make_google_id_token, *, sub: str) -> dict:
    token = make_google_id_token(sub=sub)
    response = auth_client.post("/auth/session", json={"provider": "google", "id_token": token})
    assert response.status_code == 200, response.text
    return response.json()


class TestDeleteMeEndpoint:
    def test_deletes_authenticated_user_and_returns_empty_204(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        session = _create_session(auth_client, make_google_id_token, sub="delete-me")

        response = auth_client.delete(
            "/users/me", headers={"Authorization": f"Bearer {session['access_token']}"}
        )

        assert response.status_code == 204
        assert response.content == b""

    def test_missing_authorization_returns_401(self, auth_client: TestClient) -> None:
        response = auth_client.delete("/users/me")

        assert response.status_code == 401
        assert response.headers["WWW-Authenticate"] == "Bearer"

    def test_expired_access_token_returns_401(
        self, auth_client: TestClient, test_settings: Settings
    ) -> None:
        token, _ = create_access_token(
            user_id=uuid.uuid4(),
            settings=test_settings,
            now=datetime.now(UTC)
            - timedelta(seconds=test_settings.auth_access_token_ttl_seconds + 1),
        )

        response = auth_client.delete("/users/me", headers={"Authorization": f"Bearer {token}"})

        assert response.status_code == 401

    def test_deletion_invalidates_access_and_refresh_tokens_and_keeps_other_user(
        self, auth_client: TestClient, make_google_id_token, db_session: Session
    ) -> None:
        deleted = _create_session(auth_client, make_google_id_token, sub="deleted-user")
        remaining = _create_session(auth_client, make_google_id_token, sub="remaining-user")

        response = auth_client.delete(
            "/users/me", headers={"Authorization": f"Bearer {deleted['access_token']}"}
        )

        assert response.status_code == 204
        deleted_user_id = uuid.UUID(deleted["user"]["id"])
        remaining_user_id = uuid.UUID(remaining["user"]["id"])
        assert db_session.get(User, deleted_user_id) is None
        assert db_session.get(User, remaining_user_id) is not None
        assert (
            db_session.scalars(
                select(RefreshToken).where(RefreshToken.user_id == deleted_user_id)
            ).all()
            == []
        )

        access_response = auth_client.get(
            "/auth/me", headers={"Authorization": f"Bearer {deleted['access_token']}"}
        )
        refresh_response = auth_client.post(
            "/auth/refresh", json={"refresh_token": deleted["refresh_token"]}
        )
        retry_response = auth_client.delete(
            "/users/me", headers={"Authorization": f"Bearer {deleted['access_token']}"}
        )

        assert access_response.status_code == 401
        assert refresh_response.status_code == 401
        assert retry_response.status_code == 401
