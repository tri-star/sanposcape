import uuid
from datetime import UTC, datetime, timedelta

import jwt
from fastapi.testclient import TestClient

from sanposcape.auth.tokens import ACCESS_TOKEN_TYPE, create_access_token
from sanposcape.config import Settings


def _create_session(auth_client: TestClient, make_google_id_token) -> dict:
    token = make_google_id_token()
    res = auth_client.post("/auth/session", json={"provider": "google", "id_token": token})
    assert res.status_code == 200, res.text
    return res.json()


class TestGetCurrentUser:
    """`get_current_user` を GET /auth/me 経由で検証する（D7）。"""

    def test_valid_access_token_returns_200(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        session = _create_session(auth_client, make_google_id_token)

        res = auth_client.get(
            "/auth/me", headers={"Authorization": f"Bearer {session['access_token']}"}
        )

        assert res.status_code == 200
        assert res.json()["id"] == session["user"]["id"]

    def test_missing_authorization_header_returns_401_not_403(
        self, auth_client: TestClient
    ) -> None:
        """auto_error=True の HTTPBearer は 403 を返してしまう既知の落とし穴の回帰防止。"""
        res = auth_client.get("/auth/me")

        assert res.status_code == 401
        assert res.status_code != 403

    def test_wrong_scheme_returns_401(self, auth_client: TestClient) -> None:
        res = auth_client.get("/auth/me", headers={"Authorization": "Basic dXNlcjpwYXNz"})

        assert res.status_code == 401

    def test_tampered_token_returns_401(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        session = _create_session(auth_client, make_google_id_token)
        tampered = session["access_token"][:-1] + (
            "A" if session["access_token"][-1] != "A" else "B"
        )

        res = auth_client.get("/auth/me", headers={"Authorization": f"Bearer {tampered}"})

        assert res.status_code == 401

    def test_expired_token_returns_401(
        self, auth_client: TestClient, test_settings: Settings
    ) -> None:
        expired_token, _ = create_access_token(
            uuid.uuid4(),
            test_settings,
            now=datetime.now(UTC)
            - timedelta(seconds=test_settings.auth_access_token_ttl_seconds + 10),
        )

        res = auth_client.get("/auth/me", headers={"Authorization": f"Bearer {expired_token}"})

        assert res.status_code == 401

    def test_unknown_user_id_returns_401(
        self, auth_client: TestClient, test_settings: Settings
    ) -> None:
        """発行後にユーザーが DB から削除された場合の access token。"""
        token, _ = create_access_token(uuid.uuid4(), test_settings)

        res = auth_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

        assert res.status_code == 401

    def test_response_includes_www_authenticate_header(self, auth_client: TestClient) -> None:
        res = auth_client.get("/auth/me")

        assert res.headers.get("WWW-Authenticate") == "Bearer"

    def test_refresh_token_used_as_access_token_returns_401(
        self, auth_client: TestClient, test_settings: Settings
    ) -> None:
        """typ != 'access' のトークン（refresh token を誤って Bearer に入れるケース）を拒否する。"""
        now = datetime.now(UTC)
        payload = {
            "sub": str(uuid.uuid4()),
            "iss": test_settings.auth_token_issuer,
            "aud": test_settings.auth_token_audience,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=5)).timestamp()),
            "jti": str(uuid.uuid4()),
            "typ": "refresh",
        }
        assert ACCESS_TOKEN_TYPE == "access"
        token = jwt.encode(payload, test_settings.auth_jwt_secret, algorithm="HS256")

        res = auth_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

        assert res.status_code == 401
