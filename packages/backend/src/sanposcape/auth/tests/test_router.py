from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from sanposcape.auth.models import RefreshToken


def _create_session(auth_client: TestClient, make_google_id_token, **token_kwargs) -> dict:
    token = make_google_id_token(**token_kwargs)
    res = auth_client.post("/auth/session", json={"provider": "google", "id_token": token})
    assert res.status_code == 200, res.text
    return res.json()


class TestSessionEndpoint:
    def test_returns_token_set_and_user(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        body = _create_session(auth_client, make_google_id_token)

        assert body["access_token"]
        assert body["expires_in"] == 900
        assert body["refresh_token"]
        assert body["user"]["email"] == "user@example.com"
        assert body["user"]["display_name"] == "テストユーザー"

    def test_same_sub_returns_same_user_id(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        first = _create_session(auth_client, make_google_id_token, sub="google-sub-1")
        second = _create_session(auth_client, make_google_id_token, sub="google-sub-1")

        assert first["user"]["id"] == second["user"]["id"]

    def test_profile_change_is_reflected(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        first = _create_session(
            auth_client, make_google_id_token, sub="google-sub-1", name="旧名前"
        )
        second = _create_session(
            auth_client, make_google_id_token, sub="google-sub-1", name="新名前"
        )

        assert first["user"]["id"] == second["user"]["id"]
        assert second["user"]["display_name"] == "新名前"

    def test_invalid_id_token_returns_401(self, auth_client: TestClient) -> None:
        res = auth_client.post(
            "/auth/session", json={"provider": "google", "id_token": "not-a-valid-jwt"}
        )
        assert res.status_code == 401

    def test_invalid_provider_returns_422(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        token = make_google_id_token()
        res = auth_client.post("/auth/session", json={"provider": "apple", "id_token": token})
        assert res.status_code == 422

    def test_missing_id_token_returns_422(self, auth_client: TestClient) -> None:
        res = auth_client.post("/auth/session", json={"provider": "google"})
        assert res.status_code == 422


class TestRefreshEndpoint:
    def test_rotates_refresh_token(self, auth_client: TestClient, make_google_id_token) -> None:
        session = _create_session(auth_client, make_google_id_token)

        res = auth_client.post("/auth/refresh", json={"refresh_token": session["refresh_token"]})

        assert res.status_code == 200
        refreshed = res.json()
        assert refreshed["refresh_token"] != session["refresh_token"]

    def test_new_access_token_passes_get_current_user(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        session = _create_session(auth_client, make_google_id_token)
        refreshed = auth_client.post(
            "/auth/refresh", json={"refresh_token": session["refresh_token"]}
        ).json()

        res = auth_client.get(
            "/auth/me", headers={"Authorization": f"Bearer {refreshed['access_token']}"}
        )

        assert res.status_code == 200
        assert res.json()["id"] == session["user"]["id"]

    def test_reused_refresh_token_revokes_whole_family(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        session = _create_session(auth_client, make_google_id_token)
        old_refresh_token = session["refresh_token"]

        refreshed = auth_client.post(
            "/auth/refresh", json={"refresh_token": old_refresh_token}
        ).json()
        new_refresh_token = refreshed["refresh_token"]

        # 古いトークンの再送 → 再利用検知で 401
        reuse_res = auth_client.post("/auth/refresh", json={"refresh_token": old_refresh_token})
        assert reuse_res.status_code == 401

        # 直前に発行された新トークンも family ごと失効しているため 401 になる
        chained_res = auth_client.post("/auth/refresh", json={"refresh_token": new_refresh_token})
        assert chained_res.status_code == 401

    def test_unknown_refresh_token_returns_401(self, auth_client: TestClient) -> None:
        res = auth_client.post("/auth/refresh", json={"refresh_token": "unknown-token"})
        assert res.status_code == 401

    def test_expired_refresh_token_returns_401(
        self, auth_client: TestClient, make_google_id_token, db_session: Session
    ) -> None:
        session = _create_session(auth_client, make_google_id_token)

        # DB を直接操作して期限切れにする
        row = db_session.scalars(select(RefreshToken)).first()
        assert row is not None
        row.expires_at = datetime.now(UTC) - timedelta(days=1)
        db_session.commit()

        res = auth_client.post("/auth/refresh", json={"refresh_token": session["refresh_token"]})
        assert res.status_code == 401


class TestLogoutEndpoint:
    def test_logout_returns_204(self, auth_client: TestClient, make_google_id_token) -> None:
        session = _create_session(auth_client, make_google_id_token)

        res = auth_client.post("/auth/logout", json={"refresh_token": session["refresh_token"]})

        assert res.status_code == 204

    def test_refresh_after_logout_returns_401(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        session = _create_session(auth_client, make_google_id_token)
        auth_client.post("/auth/logout", json={"refresh_token": session["refresh_token"]})

        res = auth_client.post("/auth/refresh", json={"refresh_token": session["refresh_token"]})

        assert res.status_code == 401

    def test_logout_with_unknown_token_is_idempotent(self, auth_client: TestClient) -> None:
        res = auth_client.post("/auth/logout", json={"refresh_token": "unknown-token"})
        assert res.status_code == 204

    def test_logout_twice_is_idempotent(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        session = _create_session(auth_client, make_google_id_token)

        first = auth_client.post("/auth/logout", json={"refresh_token": session["refresh_token"]})
        second = auth_client.post("/auth/logout", json={"refresh_token": session["refresh_token"]})

        assert first.status_code == 204
        assert second.status_code == 204


class TestMeEndpoint:
    def test_returns_200_with_valid_access_token(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        session = _create_session(auth_client, make_google_id_token)

        res = auth_client.get(
            "/auth/me", headers={"Authorization": f"Bearer {session['access_token']}"}
        )

        assert res.status_code == 200
        assert res.json() == session["user"]

    def test_access_token_still_valid_after_logout(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        """access token はステートレスな短命 JWT で、logout により失効するのは refresh token のみ。

        これは仕様どおりの挙動であり、バグではないことをテストで明示する（R17）。
        即時失効が必要になる場合は jti のブラックリストが別途必要になる。
        """
        session = _create_session(auth_client, make_google_id_token)
        auth_client.post("/auth/logout", json={"refresh_token": session["refresh_token"]})

        res = auth_client.get(
            "/auth/me", headers={"Authorization": f"Bearer {session['access_token']}"}
        )

        assert res.status_code == 200
