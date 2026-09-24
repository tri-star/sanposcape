from typing import Literal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from sanposcape.api_docs.router import SCALAR_JS_URL
from sanposcape.config import Settings
from sanposcape.main import create_app


def _client(app: FastAPI) -> TestClient:
    """`with` を使わずに `TestClient` を組み立てる。

    `with TestClient(app) as client:` で入ると FastAPI の lifespan（`main._lifespan`）が
    実行され、`build_google_maps_provider` 等が実クライアントを作る。production 相当の
    `Settings`（`_production_settings()`）でこれを起動すると、テストが本来触れる必要のない
    実クライアントの構築に依存してしまう（今のところ副作用は無いが、将来 provider の
    construction 自体がネットワークに触れるようになった場合に壊れやすい）。このテストファイルは
    `/docs` `/redoc` `/openapi.json` という lifespan 由来の `app.state` を一切参照しない
    エンドポイントしか叩かないため、`with` を使わずに済ませて lifespan を起動しない
    （既存の `auth/tests/test_dev_router.py` 等、lifespan の影響を受ける他ドメインのテストは
    引き続き `with` を使っており、ここだけ意図的に統一しない）。
    """
    return TestClient(app)


def _production_settings(env: Literal["staging", "production"] = "production") -> Settings:
    """production と同じ必須項目を持つ `Settings` を組み立てる。

    `env` だけ差し替えれば staging 用にも使える（staging は production と同じ
    必須項目を要求する。config.py の許可リスト方式を参照）。
    """
    return Settings(
        env=env,
        auth_mode="real",
        auth_jwt_secret="x" * 32,
        google_allowed_audiences=["aud"],
        google_maps_server_api_key="test-server-key",
        database_dsn="postgres://user:pw@host.example.com/db",
    )


@pytest.fixture(params=["test", "local", "staging"])
def non_production_settings(request: pytest.FixtureRequest, test_settings: Settings) -> Settings:
    """`/docs` を出す env（local / test / staging）を一通り確認する。"""
    if request.param == "test":
        return test_settings
    if request.param == "local":
        return Settings(
            env="local",
            auth_mode="real",
            auth_jwt_secret="x" * 32,
            google_allowed_audiences=["test-audience"],
        )
    return _production_settings(env="staging")


def test_scalar_docs_returns_html_with_pinned_js_url(non_production_settings: Settings) -> None:
    app = create_app(non_production_settings)
    client = _client(app)

    res = client.get("/docs")

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/html")
    assert SCALAR_JS_URL in res.text


def test_scalar_docs_disables_telemetry_and_agent(non_production_settings: Settings) -> None:
    """設定 JSON の出力形式は scalar-fastapi の版に依存する。壊れたら実際の HTML を
    出力し直して区切りを確認し、期待する文字列を直すこと。
    """
    app = create_app(non_production_settings)
    client = _client(app)

    res = client.get("/docs")

    assert '"telemetry": false' in res.text
    assert '"agent": {"disabled": true}' in res.text


def test_docs_and_redoc_are_absent_from_openapi_schema(non_production_settings: Settings) -> None:
    app = create_app(non_production_settings)

    schema = app.openapi()

    assert "/docs" not in schema["paths"]
    assert "/redoc" not in schema["paths"]


def test_redoc_returns_404(non_production_settings: Settings) -> None:
    app = create_app(non_production_settings)
    client = _client(app)

    res = client.get("/redoc")

    assert res.status_code == 404


def test_docs_returns_404_in_production() -> None:
    app = create_app(_production_settings())
    client = _client(app)

    res = client.get("/docs")

    assert res.status_code == 404


def test_redoc_returns_404_in_production() -> None:
    app = create_app(_production_settings())
    client = _client(app)

    res = client.get("/redoc")

    assert res.status_code == 404


def test_openapi_json_is_available_in_production() -> None:
    """全環境で `/openapi.json` を残すという決定の回帰防止。"""
    app = create_app(_production_settings())
    client = _client(app)

    res = client.get("/openapi.json")

    assert res.status_code == 200


def test_openapi_output_is_identical_regardless_of_docs_availability(
    test_settings: Settings,
) -> None:
    """`/docs` を出すかどうか（env の違い）で OpenAPI の出力が変わらないことを固定する
    （`auth/tests/test_dev_router.py` の
    `test_openapi_output_is_identical_regardless_of_auth_mode` と同じ考え方）。
    """
    non_production_schema = create_app(test_settings).openapi()
    production_schema = create_app(_production_settings()).openapi()

    assert non_production_schema == production_schema
