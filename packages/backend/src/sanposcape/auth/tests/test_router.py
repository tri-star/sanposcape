import json
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest import mock

import pytest
from fastapi.testclient import TestClient
from psycopg.errors import ForeignKeyViolation, UniqueViolation
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from sanposcape.auth.models import RefreshToken
from sanposcape.auth.repository import RefreshTokenRepository
from sanposcape.auth.tests.conftest import RAW_NONCE
from sanposcape.config import Settings, get_settings
from sanposcape.conftest import override_get_db
from sanposcape.database import get_db
from sanposcape.main import create_app
from sanposcape.users.models import User


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
        res = auth_client.post("/auth/session", json={"provider": "facebook", "id_token": token})
        assert res.status_code == 422

    def test_missing_id_token_returns_422(self, auth_client: TestClient) -> None:
        res = auth_client.post("/auth/session", json={"provider": "google"})
        assert res.status_code == 422

    def test_oversized_id_token_returns_422(self, auth_client: TestClient) -> None:
        """B-1: 上限の無い `str` は、巨大な文字列を送りつけてパース・デコードに
        CPU/メモリを浪費させる低コストDoSの入り口になり得るため、上限超過は422で弾く。
        """
        res = auth_client.post(
            "/auth/session",
            json={"provider": "google", "id_token": "a" * 4097},
        )
        assert res.status_code == 422


def _post_apple_session(auth_client: TestClient, make_apple_id_token, *, token_kwargs=None, **body):
    token = make_apple_id_token(**(token_kwargs or {}))
    payload = {"provider": "apple", "id_token": token, "nonce": RAW_NONCE, **body}
    return auth_client.post("/auth/session", json=payload)


class TestAppleSessionEndpoint:
    def test_returns_session_and_creates_apple_user(
        self, auth_client: TestClient, make_apple_id_token
    ) -> None:
        res = _post_apple_session(
            auth_client,
            make_apple_id_token,
            token_kwargs={"sub": "apple-sub-1", "email": "user@example.com"},
            display_name="山田 太郎",
        )

        assert res.status_code == 200, res.text
        body = res.json()
        assert body["access_token"]
        assert body["refresh_token"]
        assert body["user"]["display_name"] == "山田 太郎"
        assert body["user"]["email"] == "user@example.com"
        assert body["user"]["photo_url"] is None

        me = auth_client.get(
            "/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}
        )
        assert me.status_code == 200
        assert me.json()["id"] == body["user"]["id"]

    def test_user_is_persisted_with_apple_provider(
        self, auth_client: TestClient, make_apple_id_token, db_session: Session
    ) -> None:
        res = _post_apple_session(
            auth_client, make_apple_id_token, token_kwargs={"sub": "apple-sub-1"}
        )
        assert res.status_code == 200, res.text

        user = db_session.scalar(select(User).where(User.provider_subject == "apple-sub-1"))
        assert user is not None
        assert user.provider == "apple"

    def test_nonce_mismatch_returns_401(self, auth_client: TestClient, make_apple_id_token) -> None:
        res = _post_apple_session(
            auth_client, make_apple_id_token, nonce="another-raw-nonce-0123456789"
        )

        assert res.status_code == 401

    def test_unhashed_nonce_in_token_returns_401(
        self, auth_client: TestClient, make_apple_id_token
    ) -> None:
        res = _post_apple_session(
            auth_client, make_apple_id_token, token_kwargs={"nonce": RAW_NONCE}
        )

        assert res.status_code == 401

    def test_missing_nonce_returns_422(self, auth_client: TestClient, make_apple_id_token) -> None:
        token = make_apple_id_token()
        res = auth_client.post("/auth/session", json={"provider": "apple", "id_token": token})

        assert res.status_code == 422

    def test_explicit_null_nonce_returns_422(
        self, auth_client: TestClient, make_apple_id_token
    ) -> None:
        token = make_apple_id_token()
        res = auth_client.post(
            "/auth/session", json={"provider": "apple", "id_token": token, "nonce": None}
        )

        assert res.status_code == 422

    def test_short_nonce_returns_422(self, auth_client: TestClient, make_apple_id_token) -> None:
        res = _post_apple_session(auth_client, make_apple_id_token, nonce="a" * 15)

        assert res.status_code == 422

    def test_too_long_nonce_returns_422(self, auth_client: TestClient, make_apple_id_token) -> None:
        res = _post_apple_session(auth_client, make_apple_id_token, nonce="a" * 257)

        assert res.status_code == 422

    def test_wrong_audience_returns_401(self, auth_client: TestClient, make_apple_id_token) -> None:
        res = _post_apple_session(
            auth_client, make_apple_id_token, token_kwargs={"aud": "host.exp.Exponent"}
        )

        assert res.status_code == 401

    def test_google_token_sent_as_apple_returns_401(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        token = make_google_id_token()
        res = auth_client.post(
            "/auth/session", json={"provider": "apple", "id_token": token, "nonce": RAW_NONCE}
        )

        assert res.status_code == 401

    def test_same_sub_in_google_and_apple_are_different_users(
        self, auth_client: TestClient, make_google_id_token, make_apple_id_token
    ) -> None:
        google = _create_session(auth_client, make_google_id_token, sub="shared-sub")
        apple = _post_apple_session(
            auth_client, make_apple_id_token, token_kwargs={"sub": "shared-sub"}
        )

        assert apple.status_code == 200
        assert apple.json()["user"]["id"] != google["user"]["id"]

    def test_relogin_does_not_overwrite_display_name(
        self, auth_client: TestClient, make_apple_id_token
    ) -> None:
        first = _post_apple_session(auth_client, make_apple_id_token, display_name="最初の名前")
        second = _post_apple_session(auth_client, make_apple_id_token, display_name="別の名前")

        assert first.json()["user"]["id"] == second.json()["user"]["id"]
        assert second.json()["user"]["display_name"] == "最初の名前"

    def test_relogin_without_display_name_keeps_it(
        self, auth_client: TestClient, make_apple_id_token
    ) -> None:
        _post_apple_session(auth_client, make_apple_id_token, display_name="最初の名前")
        second = _post_apple_session(auth_client, make_apple_id_token)

        assert second.json()["user"]["display_name"] == "最初の名前"

    def test_first_login_without_display_name_leaves_it_null(
        self, auth_client: TestClient, make_apple_id_token
    ) -> None:
        res = _post_apple_session(auth_client, make_apple_id_token)

        assert res.status_code == 200
        assert res.json()["user"]["display_name"] is None

    def test_display_name_is_stripped(self, auth_client: TestClient, make_apple_id_token) -> None:
        res = _post_apple_session(
            auth_client, make_apple_id_token, display_name="\u3000 山田 太郎 \n"
        )

        assert res.json()["user"]["display_name"] == "山田 太郎"

    def test_blank_display_name_is_treated_as_unspecified(
        self, auth_client: TestClient, make_apple_id_token
    ) -> None:
        res = _post_apple_session(auth_client, make_apple_id_token, display_name="  \u3000 ")

        assert res.status_code == 200
        assert res.json()["user"]["display_name"] is None

    def test_display_name_at_max_length_is_accepted(
        self, auth_client: TestClient, make_apple_id_token
    ) -> None:
        res = _post_apple_session(auth_client, make_apple_id_token, display_name="あ" * 255)

        assert res.status_code == 200
        assert res.json()["user"]["display_name"] == "あ" * 255

    def test_too_long_display_name_returns_422(
        self, auth_client: TestClient, make_apple_id_token
    ) -> None:
        res = _post_apple_session(auth_client, make_apple_id_token, display_name="あ" * 256)

        assert res.status_code == 422

    @pytest.mark.parametrize(
        "name",
        [
            "山田\x00太郎",  # Cc: NUL
            "山田\n太郎",  # Cc: 改行
            "山田\t太郎",  # Cc: タブ
            "山田\u2028太郎",  # Zl: 行区切り
            "山田\u2029太郎",  # Zp: 段落区切り
            "山田\u202e太郎",  # Cf: bidi 上書き
            "山田\u200b太郎",  # Cf: ゼロ幅スペース
            "山田\u2066太郎",  # Cf: bidi 分離
        ],
    )
    def test_display_name_with_control_or_format_characters_returns_422(
        self, auth_client: TestClient, make_apple_id_token, name: str
    ) -> None:
        res = _post_apple_session(auth_client, make_apple_id_token, display_name=name)

        assert res.status_code == 422

    @pytest.mark.parametrize(
        "name",
        [
            "👩\u200d👩\u200d👧",  # ZWJ（絵文字の合字）
            "می\u200cخواهم",  # ZWNJ（ペルシア語の正書法）
        ],
    )
    def test_display_name_with_zwj_or_zwnj_is_accepted(
        self, auth_client: TestClient, make_apple_id_token, name: str
    ) -> None:
        res = _post_apple_session(auth_client, make_apple_id_token, display_name=name)

        assert res.status_code == 200
        assert res.json()["user"]["display_name"] == name

    def test_relogin_fills_null_display_name(
        self, auth_client: TestClient, make_apple_id_token
    ) -> None:
        first = _post_apple_session(auth_client, make_apple_id_token)
        second = _post_apple_session(
            auth_client, make_apple_id_token, display_name="後から来た名前"
        )

        assert first.json()["user"]["id"] == second.json()["user"]["id"]
        assert first.json()["user"]["display_name"] is None
        assert second.json()["user"]["display_name"] == "後から来た名前"

    def test_google_session_applies_display_name_only_when_token_has_no_name(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        token = make_google_id_token(sub="google-sub-nn", name=None)
        res = auth_client.post(
            "/auth/session",
            json={"provider": "google", "id_token": token, "display_name": "端末の名前"},
        )
        assert res.json()["user"]["display_name"] == "端末の名前"

        token = make_google_id_token(sub="google-sub-nm", name="トークンの名前")
        res = auth_client.post(
            "/auth/session",
            json={"provider": "google", "id_token": token, "display_name": "端末の名前"},
        )
        assert res.json()["user"]["display_name"] == "トークンの名前"


class TestAppleUnconfigured:
    def test_apple_returns_400_when_audience_is_not_configured(self, make_apple_id_token) -> None:
        settings = Settings(
            env="test",
            auth_mode="real",
            auth_jwt_secret="x" * 32,
            google_allowed_audiences=["test-audience"],
            apple_allowed_audiences=[],
        )
        # get_identity_providers は上書きせず、実際の build_identity_providers を通す
        app = create_app(settings)
        app.dependency_overrides[get_settings] = lambda: settings
        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app) as client:
            res = client.post(
                "/auth/session",
                json={
                    "provider": "apple",
                    "id_token": make_apple_id_token(),
                    "nonce": RAW_NONCE,
                },
            )

        assert res.status_code == 400
        assert res.json() == {"detail": "Unsupported provider"}


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

    def test_refresh_returns_401_for_foreign_key_integrity_error(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        """防御的に分類した FK 違反は、既存の無効 token 401 契約へ正規化する。"""
        session = _create_session(auth_client, make_google_id_token)
        foreign_key_error = IntegrityError(
            "INSERT INTO refresh_tokens ...",
            {},
            ForeignKeyViolation(),
        )

        # 実際のロック競合はサービス層で retry する。このテストは、最終的に発生した
        # FK 制約違反を正しく分類する防御的な境界だけを検証する。
        with mock.patch.object(RefreshTokenRepository, "create", side_effect=foreign_key_error):
            res = auth_client.post(
                "/auth/refresh", json={"refresh_token": session["refresh_token"]}
            )

        assert res.status_code == 401
        assert res.headers["WWW-Authenticate"] == "Bearer"

    def test_refresh_reraises_non_foreign_key_integrity_error_as_500(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        """一意制約違反などは無効 token として握り潰さず、500 として検知できる。"""
        session = _create_session(auth_client, make_google_id_token)
        unique_violation = IntegrityError(
            "INSERT INTO refresh_tokens ...",
            {},
            UniqueViolation(),
        )

        # TestClient の既定はサーバー例外を再送出するため、HTTP 500 を検証する専用 client を使う。
        with (
            TestClient(auth_client.app, raise_server_exceptions=False) as server_error_client,
            mock.patch.object(RefreshTokenRepository, "create", side_effect=unique_violation),
        ):
            res = server_error_client.post(
                "/auth/refresh", json={"refresh_token": session["refresh_token"]}
            )

        assert res.status_code == 500

    def test_oversized_refresh_token_returns_422(self, auth_client: TestClient) -> None:
        """B-1: `generate_refresh_token()` は約43文字なので、上限超過は不正な入力として弾く。"""
        res = auth_client.post("/auth/refresh", json={"refresh_token": "a" * 513})
        assert res.status_code == 422

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


def _access_log(json_logs: list[dict[str, Any]], route: str) -> dict[str, Any]:
    (access,) = [
        r for r in json_logs if r.get("log_type") == "access" and r.get("http_route") == route
    ]
    return access


class TestUserIdInLogs:
    """ログイン・refresh・logout の経路は `get_current_user` を通らないが、
    ユーザーが確定した時点でログに内部 UUID を付ける（SS-181）。"""

    def test_session_access_log_has_the_created_users_id(
        self, auth_client: TestClient, make_google_id_token, json_logs: list[dict[str, Any]]
    ) -> None:
        body = _create_session(auth_client, make_google_id_token)

        assert _access_log(json_logs, "/auth/session")["user_id"] == body["user"]["id"]

    def test_invalid_id_token_has_no_user_id(
        self, auth_client: TestClient, json_logs: list[dict[str, Any]]
    ) -> None:
        res = auth_client.post("/auth/session", json={"provider": "google", "id_token": "bad"})

        assert res.status_code == 401
        assert "user_id" not in _access_log(json_logs, "/auth/session")

    def test_refresh_access_log_has_the_token_owners_id(
        self, auth_client: TestClient, make_google_id_token, json_logs: list[dict[str, Any]]
    ) -> None:
        session = _create_session(auth_client, make_google_id_token)
        json_logs.clear()

        res = auth_client.post("/auth/refresh", json={"refresh_token": session["refresh_token"]})

        assert res.status_code == 200
        assert _access_log(json_logs, "/auth/refresh")["user_id"] == session["user"]["id"]

    def test_reuse_detection_logs_carry_the_token_owners_id(
        self, auth_client: TestClient, make_google_id_token, json_logs: list[dict[str, Any]]
    ) -> None:
        session = _create_session(auth_client, make_google_id_token)
        auth_client.post("/auth/refresh", json={"refresh_token": session["refresh_token"]})
        json_logs.clear()

        res = auth_client.post("/auth/refresh", json={"refresh_token": session["refresh_token"]})

        assert res.status_code == 401
        user_id = session["user"]["id"]
        assert _access_log(json_logs, "/auth/refresh")["user_id"] == user_id
        (warning,) = [r for r in json_logs if "reuse detected" in r["message"]]
        assert warning["level"] == "WARNING"
        assert warning["user_id"] == user_id

    def test_expired_refresh_token_access_log_has_the_token_owners_id(
        self,
        auth_client: TestClient,
        make_google_id_token,
        db_session: Session,
        json_logs: list[dict[str, Any]],
    ) -> None:
        session = _create_session(auth_client, make_google_id_token)
        row = db_session.scalars(select(RefreshToken)).first()
        assert row is not None
        row.expires_at = datetime.now(UTC) - timedelta(days=1)
        db_session.commit()
        json_logs.clear()

        res = auth_client.post("/auth/refresh", json={"refresh_token": session["refresh_token"]})

        assert res.status_code == 401
        assert _access_log(json_logs, "/auth/refresh")["user_id"] == session["user"]["id"]

    def test_unknown_refresh_token_has_no_user_id(
        self, auth_client: TestClient, json_logs: list[dict[str, Any]]
    ) -> None:
        res = auth_client.post("/auth/refresh", json={"refresh_token": "unknown-token"})

        assert res.status_code == 401
        assert "user_id" not in _access_log(json_logs, "/auth/refresh")

    def test_logout_access_log_has_the_token_owners_id(
        self, auth_client: TestClient, make_google_id_token, json_logs: list[dict[str, Any]]
    ) -> None:
        session = _create_session(auth_client, make_google_id_token)
        json_logs.clear()

        res = auth_client.post("/auth/logout", json={"refresh_token": session["refresh_token"]})

        assert res.status_code == 204
        assert _access_log(json_logs, "/auth/logout")["user_id"] == session["user"]["id"]

    def test_logout_with_an_unknown_token_has_no_user_id(
        self, auth_client: TestClient, json_logs: list[dict[str, Any]]
    ) -> None:
        res = auth_client.post("/auth/logout", json={"refresh_token": "unknown-token"})

        assert res.status_code == 204
        assert "user_id" not in _access_log(json_logs, "/auth/logout")

    def test_no_log_line_carries_the_email_or_display_name(
        self, auth_client: TestClient, make_google_id_token, json_logs: list[dict[str, Any]]
    ) -> None:
        session = _create_session(auth_client, make_google_id_token)
        auth_client.post("/auth/refresh", json={"refresh_token": session["refresh_token"]})
        auth_client.post("/auth/refresh", json={"refresh_token": session["refresh_token"]})
        auth_client.post("/auth/logout", json={"refresh_token": session["refresh_token"]})

        dumped = json.dumps(json_logs, ensure_ascii=False)
        assert json_logs
        assert session["user"]["email"] not in dumped
        assert session["user"]["display_name"] not in dumped
