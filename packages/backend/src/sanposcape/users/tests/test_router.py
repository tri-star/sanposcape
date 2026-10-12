import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from sanposcape.auth.models import RefreshToken
from sanposcape.auth.tests.conftest import (
    APPLE_AUDIENCE,
    APPLE_DEFAULT_SUB,
    RAW_NONCE,
    FakeAppleSignInClient,
)
from sanposcape.auth.tokens import create_access_token
from sanposcape.config import Settings
from sanposcape.integrations.apple.exceptions import (
    AppleSignInNotConfiguredError,
    AppleSignInRejectedError,
    AppleSignInUnavailableError,
)
from sanposcape.users.models import AppleAuthorization, User
from sanposcape.walks.models import Walk
from sanposcape.walks.repository import WalkRepository


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

    def test_deletion_cascades_to_walks_and_keeps_other_users_walks(
        self, auth_client: TestClient, make_google_id_token, db_session: Session
    ) -> None:
        """SS-18 回帰テスト: `walks.user_id` の `ON DELETE CASCADE` が壊れていないこと。

        CASCADE が欠けていると `DELETE /users/me` は refresh_tokens 削除の直後、
        walks の FK 違反で 500 になる（walks/models.py の設計メモ参照）。
        """
        deleted = _create_session(auth_client, make_google_id_token, sub="deleted-walks-user")
        remaining = _create_session(auth_client, make_google_id_token, sub="remaining-walks-user")
        deleted_user_id = uuid.UUID(deleted["user"]["id"])
        remaining_user_id = uuid.UUID(remaining["user"]["id"])

        repo = WalkRepository(db_session)
        started_at = datetime.now(UTC) - timedelta(hours=1)
        deleted_walk, _ = repo.create(
            user_id=deleted_user_id,
            client_walk_id=uuid.uuid4(),
            started_at=started_at,
            ended_at=started_at + timedelta(minutes=10),
            duration_seconds=600,
            distance_meters=1000,
            destination_place_id="place-1",
            destination_name="テスト公園",
            destination_latitude=35.68,
            destination_longitude=139.76,
            track_points=[],
        )
        remaining_walk, _ = repo.create(
            user_id=remaining_user_id,
            client_walk_id=uuid.uuid4(),
            started_at=started_at,
            ended_at=started_at + timedelta(minutes=10),
            duration_seconds=600,
            distance_meters=1000,
            destination_place_id="place-1",
            destination_name="テスト公園",
            destination_latitude=35.68,
            destination_longitude=139.76,
            track_points=[],
        )
        # commit() は expire_on_commit によりインスタンスの属性を失効させるため、
        # WHERE 句で参照する前に id を素の UUID として控えておく。
        deleted_walk_id = deleted_walk.id
        remaining_walk_id = remaining_walk.id
        db_session.commit()

        response = auth_client.delete(
            "/users/me", headers={"Authorization": f"Bearer {deleted['access_token']}"}
        )

        assert response.status_code == 204
        assert db_session.scalars(select(Walk).where(Walk.id == deleted_walk_id)).first() is None
        assert (
            db_session.scalars(select(Walk).where(Walk.id == remaining_walk_id)).first() is not None
        )


def _create_apple_session(
    auth_client: TestClient,
    make_apple_id_token,
    *,
    authorization_code: str | None,
    sub: str = APPLE_DEFAULT_SUB,
) -> dict:
    body = {
        "provider": "apple",
        "id_token": make_apple_id_token(sub=sub),
        "nonce": RAW_NONCE,
    }
    if authorization_code is not None:
        body["authorization_code"] = authorization_code
    response = auth_client.post("/auth/session", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def _delete_me(auth_client: TestClient, session: dict):
    return auth_client.delete(
        "/users/me", headers={"Authorization": f"Bearer {session['access_token']}"}
    )


class TestDeleteMeForAppleUser:
    """SS-198: Apple ユーザーの削除で、Apple のトークン失効 API が呼ばれる。"""

    def test_revokes_the_token_saved_at_sign_in_then_deletes(
        self,
        auth_client: TestClient,
        make_apple_id_token,
        fake_apple_client: FakeAppleSignInClient,
        db_session: Session,
    ) -> None:
        session = _create_apple_session(
            auth_client, make_apple_id_token, authorization_code="code-1"
        )
        # サインイン時に交換した refresh token（Fake が code から決定的に作る）。
        exchanged_token = "refresh-token-for-code-1"
        assert fake_apple_client.exchange_calls == [("code-1", APPLE_AUDIENCE)]

        response = _delete_me(auth_client, session)

        assert response.status_code == 204
        assert fake_apple_client.revoke_calls == [(exchanged_token, APPLE_AUDIENCE)]
        user_id = uuid.UUID(session["user"]["id"])
        assert db_session.get(User, user_id) is None
        assert db_session.scalars(select(AppleAuthorization)).all() == []

    def test_temporary_failure_returns_503_keeps_everything_and_retry_succeeds(
        self,
        auth_client: TestClient,
        make_apple_id_token,
        fake_apple_client: FakeAppleSignInClient,
        db_session: Session,
    ) -> None:
        session = _create_apple_session(
            auth_client, make_apple_id_token, authorization_code="code-1"
        )
        user_id = uuid.UUID(session["user"]["id"])
        fake_apple_client.revoke_error = AppleSignInUnavailableError("down", reason="http_5xx")

        failed = _delete_me(auth_client, session)

        assert failed.status_code == 503
        assert failed.json() == {"detail": "Account deletion temporarily unavailable"}
        assert db_session.get(User, user_id) is not None
        assert len(db_session.scalars(select(AppleAuthorization)).all()) == 1
        # セッションも生きている（再試行できる）。
        me = auth_client.get(
            "/auth/me", headers={"Authorization": f"Bearer {session['access_token']}"}
        )
        assert me.status_code == 200

        fake_apple_client.revoke_error = None
        retried = _delete_me(auth_client, session)

        assert retried.status_code == 204
        assert len(fake_apple_client.revoke_calls) == 2
        db_session.expire_all()
        assert db_session.get(User, user_id) is None
        assert db_session.scalars(select(AppleAuthorization)).all() == []

    @pytest.mark.parametrize(
        "error",
        [
            AppleSignInRejectedError("invalid_grant", 400),
            AppleSignInRejectedError("invalid_client", 401),
            AppleSignInNotConfiguredError("x"),
        ],
        ids=["invalid_grant", "invalid_client", "not-configured"],
    )
    def test_permanent_failure_still_deletes(
        self,
        auth_client: TestClient,
        make_apple_id_token,
        fake_apple_client: FakeAppleSignInClient,
        db_session: Session,
        error: Exception,
    ) -> None:
        session = _create_apple_session(
            auth_client, make_apple_id_token, authorization_code="code-1"
        )
        fake_apple_client.revoke_error = error

        response = _delete_me(auth_client, session)

        assert response.status_code == 204
        assert db_session.get(User, uuid.UUID(session["user"]["id"])) is None

    def test_apple_user_without_stored_token_is_deleted_without_revoking(
        self,
        auth_client: TestClient,
        make_apple_id_token,
        fake_apple_client: FakeAppleSignInClient,
        db_session: Session,
    ) -> None:
        session = _create_apple_session(auth_client, make_apple_id_token, authorization_code=None)

        response = _delete_me(auth_client, session)

        assert response.status_code == 204
        assert fake_apple_client.revoke_calls == []
        assert db_session.get(User, uuid.UUID(session["user"]["id"])) is None

    def test_google_user_never_triggers_revocation(
        self,
        auth_client: TestClient,
        make_google_id_token,
        fake_apple_client: FakeAppleSignInClient,
    ) -> None:
        session = _create_session(auth_client, make_google_id_token, sub="google-user")

        response = _delete_me(auth_client, session)

        assert response.status_code == 204
        assert fake_apple_client.revoke_calls == []
