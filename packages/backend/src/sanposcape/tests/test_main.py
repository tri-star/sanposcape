from fastapi import FastAPI
from fastapi.testclient import TestClient

from sanposcape.auth.exceptions import AuthenticationError
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
