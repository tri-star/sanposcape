import asyncio
import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from sanposcape.auth.exceptions import AuthenticationError
from sanposcape.core.middleware import RequestSizeLimitMiddleware
from sanposcape.main import register_exception_handlers


def test_users_router_registers_delete_me_operation() -> None:
    from sanposcape.main import app

    schema = app.openapi()
    operation = schema["paths"]["/users/me"]["delete"]

    assert "204" in operation["responses"]
    assert operation["security"] == [{"HTTPBearer": []}]


class _UnregisteredAuthError(AuthenticationError):
    """テスト専用のサブクラス。`main.py` への個別ハンドラ登録を忘れたケースを模す。"""


def test_unregistered_authentication_error_subclass_falls_back_to_401() -> None:
    """A-4: `AuthenticationError` の未分類サブクラスは、個別ハンドラの登録漏れがあっても
    素の 500 ではなく 401 に落ちる（保険ハンドラの回帰防止）。
    """
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/boom")
    def boom() -> None:
        raise _UnregisteredAuthError("oops")

    client = TestClient(app, raise_server_exceptions=False)
    res = client.get("/boom")

    assert res.status_code == 401
    assert res.headers.get("WWW-Authenticate") == "Bearer"


def test_known_authentication_error_subclass_still_uses_specific_handler() -> None:
    """具象サブクラス専用ハンドラが、保険ハンドラより優先されることの回帰防止
    （`InvalidIdTokenError` は "Invalid ID token" という専用メッセージを返す）。
    """
    from sanposcape.auth.exceptions import InvalidIdTokenError

    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/boom")
    def boom() -> None:
        raise InvalidIdTokenError("oops")

    client = TestClient(app, raise_server_exceptions=False)
    res = client.get("/boom")

    assert res.status_code == 401
    assert res.json() == {"detail": "Invalid ID token"}


def test_lifespan_closes_the_feature_flag_source_on_shutdown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """local-review F-13: `AppConfigFlagSource` の boto3 クライアント（内部に urllib3
    コネクションプールを持つ）を `_lifespan` の finally で close することを固定する
    （`HttpGoogleMapsProvider` と同じライフサイクル管理。今までは close されず非対称だった）。
    """
    from sanposcape.config import Settings
    from sanposcape.main import create_app

    closed: list[bool] = []

    class _FakeBotoClient:
        def close(self) -> None:
            closed.append(True)

    monkeypatch.setattr(
        "sanposcape.integrations.aws.appconfig.boto3.client", lambda *a, **k: _FakeBotoClient()
    )
    settings = Settings(
        env="test",
        feature_flag_mode="real",
        appconfig_application_id="app",
        appconfig_environment_id="env",
        appconfig_configuration_profile_id="profile",
    )
    app = create_app(settings)

    with TestClient(app):
        assert closed == []

    assert closed == [True]


def test_lifespan_logs_startup_and_shutdown_once_each(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """startup / shutdown の INFO ログを固定する（dev で「実行環境ごとに startup 1 回・
    shutdown 0 回」を Logs Insights で確認するための目印。ADR-005 SS-183 追補）。
    """
    from sanposcape.config import Settings
    from sanposcape.main import create_app

    app = create_app(Settings(env="test"))

    with caplog.at_level(logging.INFO, logger="sanposcape.main"), TestClient(app):
        started = [r for r in caplog.records if "Application lifespan started" in r.message]
        assert len(started) == 1
        assert not [r for r in caplog.records if "Application lifespan shutting" in r.message]

    messages = [r.message for r in caplog.records if r.name == "sanposcape.main"]
    assert messages == [
        "Application lifespan started: process-wide resources are ready.",
        "Application lifespan shutting down: closing process-wide resources.",
    ]


def test_explore_size_limit_stops_chunked_body_without_content_length() -> None:
    received_by_app: list[bytes] = []
    sent: list[dict] = []
    chunks = iter(
        [
            {"type": "http.request", "body": b"1234", "more_body": True},
            {"type": "http.request", "body": b"5678", "more_body": False},
        ]
    )

    async def inner_app(scope, receive, send) -> None:
        while True:
            message = await receive()
            received_by_app.append(message.get("body", b""))
            if not message.get("more_body", False):
                break

    async def receive() -> dict:
        return next(chunks)

    async def send(message: dict) -> None:
        sent.append(message)

    scope = {"type": "http", "path": "/explore/places", "headers": []}
    asyncio.run(
        RequestSizeLimitMiddleware(inner_app, path_prefix="/explore", max_bytes=6)(
            scope, receive, send
        )
    )

    assert received_by_app == [b"1234"]
    assert sent[0]["status"] == 413


def test_access_log_records_the_413_returned_by_the_size_limit_middleware(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """`AccessLogMiddleware` が最外層に居ることを `create_app()` 経由で固定する。

    `main.py` の `create_app()` は `AccessLogMiddleware` を **最後に** 登録している
    （Starlette の `add_middleware` は先頭挿入なので、最後に登録したものが最も外側になる）。
    この順序が崩れると、`RequestSizeLimitMiddleware` が自前で返す 413 を観測できず、
    **アクセスログのステータスだけが実際の応答とずれる**。しかも 413 のケースでしか現れないため
    静かに壊れる——今回の変更が解決しようとした「本番でどのステータスが返ったか分からない」
    問題の再発になる。ミドルウェア単体のテストでは順序を固定できないので、ここで統合して確認する。
    """
    import logging

    from sanposcape.config import Settings
    from sanposcape.main import create_app

    settings = Settings(env="test", pins_request_max_bytes=16)
    app = create_app(settings)
    client = TestClient(app)

    with caplog.at_level(logging.INFO, logger="sanposcape.core.observability"):
        response = client.post("/pin-photo-uploads", content=b"x" * 64)

    assert response.status_code == 413
    messages = [record.getMessage() for record in caplog.records]
    assert any("POST /pin-photo-uploads -> 413" in message for message in messages), messages


# --- ログの構造化（ADR-013 決定3 の SS-180 追補） ---


def _app_with_probe_routes(settings):
    import logging as _logging

    from fastapi import Depends

    from sanposcape.dependencies import get_current_user
    from sanposcape.main import create_app

    app = create_app(settings)

    @app.get("/_boom")
    def _boom() -> None:
        raise RuntimeError("never-in-the-response")

    @app.get("/_whoami")
    def _whoami(user=Depends(get_current_user)) -> dict[str, str]:
        # 認証の依存はスレッドプールで動く。その後のエンドポイント内のログにも user_id が付く。
        _logging.getLogger("sanposcape.probe").info("inside the endpoint")
        return {"id": str(user.id)}

    return app


def test_unhandled_exception_returns_500_and_leaves_exactly_one_error_across_all_loggers(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """AccessLogMiddleware が例外を握るので、uvicorn / Starlette / Mangum の ERROR は重ならない。"""
    from sanposcape.config import Settings

    client = TestClient(_app_with_probe_routes(Settings(env="test")))

    with caplog.at_level(logging.ERROR):
        response = client.get("/_boom")

    assert response.status_code == 500
    assert response.text == "Internal Server Error"
    errors = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert [r.name for r in errors] == ["sanposcape.core.observability"]
    assert errors[0].exc_info is not None


def test_user_id_is_attached_to_endpoint_and_access_logs_for_authenticated_requests(
    db_session,
    test_settings,
    json_logs: list[dict],
) -> None:
    from sanposcape.auth.tokens import create_access_token
    from sanposcape.config import get_settings
    from sanposcape.conftest import override_get_db
    from sanposcape.database import get_db
    from sanposcape.walks.tests.conftest import make_user

    user = make_user(db_session, subject="log-context-user")
    token, _ = create_access_token(user_id=user.id, settings=test_settings)
    app = _app_with_probe_routes(test_settings)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = lambda: test_settings

    response = TestClient(app).get("/_whoami", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    (inside,) = [r for r in json_logs if r["logger"] == "sanposcape.probe"]
    (access,) = [r for r in json_logs if r.get("log_type") == "access"]
    assert inside["user_id"] == str(user.id)
    assert access["user_id"] == str(user.id)
    assert access["http_route"] == "/_whoami"


def test_user_id_is_absent_for_unauthenticated_requests(
    test_settings,
    json_logs: list[dict],
) -> None:
    response = TestClient(_app_with_probe_routes(test_settings)).get("/_whoami")

    assert response.status_code == 401
    (access,) = [r for r in json_logs if r.get("log_type") == "access"]
    assert "user_id" not in access
