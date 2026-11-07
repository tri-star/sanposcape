"""`PATCH /users/me`（本人の表示名の変更。SS-268）のテスト。"""

import pytest
from fastapi.testclient import TestClient


def _create_session(
    auth_client: TestClient, make_google_id_token, *, sub: str, name: str = "テストユーザー"
) -> dict:
    token = make_google_id_token(sub=sub, name=name)
    response = auth_client.post("/auth/session", json={"provider": "google", "id_token": token})
    assert response.status_code == 200, response.text
    return response.json()


def _auth(session: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {session['access_token']}"}


class TestUpdateMeEndpoint:
    def test_updates_display_name_and_returns_user(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        """本人の表示名を変えると、200 で変えた後のユーザーが返り、`GET /auth/me` にも出る。"""
        session = _create_session(auth_client, make_google_id_token, sub="rename-1")

        res = auth_client.patch(
            "/users/me", json={"display_name": "さんぽ太郎"}, headers=_auth(session)
        )

        assert res.status_code == 200, res.text
        body = res.json()
        assert body["id"] == session["user"]["id"]
        assert body["display_name"] == "さんぽ太郎"
        assert body["email"] == session["user"]["email"]
        me = auth_client.get("/auth/me", headers=_auth(session))
        assert me.json()["display_name"] == "さんぽ太郎"

    def test_changed_display_name_survives_next_google_sign_in(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        """変えた表示名は、次に Google でサインインしても Google の名前に戻らない。"""
        session = _create_session(auth_client, make_google_id_token, sub="rename-2", name="山田")
        auth_client.patch("/users/me", json={"display_name": "やまちゃん"}, headers=_auth(session))

        again = _create_session(auth_client, make_google_id_token, sub="rename-2", name="山田")

        assert again["user"]["display_name"] == "やまちゃん"

    def test_only_changes_the_authenticated_user(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        """ほかの利用者の表示名は変わらない（本人は token で決まり、ID を受け取らない）。"""
        me = _create_session(auth_client, make_google_id_token, sub="rename-3", name="自分")
        other = _create_session(auth_client, make_google_id_token, sub="rename-4", name="他人")

        auth_client.patch("/users/me", json={"display_name": "新しい自分"}, headers=_auth(me))

        assert auth_client.get("/auth/me", headers=_auth(other)).json()["display_name"] == "他人"

    def test_strips_surrounding_whitespace(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        """前後の空白（全角を含む）は除去して保存する。"""
        session = _create_session(auth_client, make_google_id_token, sub="rename-5")

        res = auth_client.patch(
            "/users/me", json={"display_name": "\u3000 さんぽ \u3000"}, headers=_auth(session)
        )

        assert res.status_code == 200, res.text
        assert res.json()["display_name"] == "さんぽ"

    def test_accepts_max_length_in_code_points(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        """上限は 50 code point。サロゲートペアの絵文字も 1 文字として数える。"""
        session = _create_session(auth_client, make_google_id_token, sub="rename-6")

        res = auth_client.patch(
            "/users/me", json={"display_name": "🚶" * 50}, headers=_auth(session)
        )

        assert res.status_code == 200, res.text
        assert res.json()["display_name"] == "🚶" * 50

    @pytest.mark.parametrize(
        "payload",
        [
            pytest.param({"display_name": "あ" * 51}, id="too_long"),
            pytest.param({"display_name": ""}, id="empty"),
            pytest.param({"display_name": " \u3000 "}, id="blank"),
            pytest.param({"display_name": None}, id="null"),
            pytest.param({}, id="missing"),
            pytest.param({"display_name": "名前", "email": "x@example.com"}, id="extra_field"),
            pytest.param({"display_name": "名\n前"}, id="newline"),
            pytest.param({"display_name": "名\u202e前"}, id="bidi_override"),
            pytest.param({"display_name": "名\u200b前"}, id="zero_width_space"),
        ],
    )
    def test_invalid_payload_returns_422_and_keeps_name(
        self, auth_client: TestClient, make_google_id_token, payload: dict
    ) -> None:
        """長すぎる・空・null・未知の項目・制御文字や書式制御文字は 422 で、表示名は変わらない。"""
        session = _create_session(
            auth_client, make_google_id_token, sub="rename-7", name="元の名前"
        )

        res = auth_client.patch("/users/me", json=payload, headers=_auth(session))

        assert res.status_code == 422, res.text
        assert auth_client.get("/auth/me", headers=_auth(session)).json()["display_name"] == (
            "元の名前"
        )

    def test_accepts_zwj_emoji_sequence(
        self, auth_client: TestClient, make_google_id_token
    ) -> None:
        """絵文字の合字に要る ZWJ（U+200D）は許可する（サインインの氏名と同じ規則）。"""
        session = _create_session(auth_client, make_google_id_token, sub="rename-8")
        name = "👨\u200d👩\u200d👧"

        res = auth_client.patch("/users/me", json={"display_name": name}, headers=_auth(session))

        assert res.status_code == 200, res.text
        assert res.json()["display_name"] == name

    def test_requires_authentication(self, auth_client: TestClient) -> None:
        """認証ヘッダーが無ければ 401。"""
        res = auth_client.patch("/users/me", json={"display_name": "名前"})

        assert res.status_code == 401
