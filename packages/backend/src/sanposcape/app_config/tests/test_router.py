import json
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from sanposcape.config import Settings
from sanposcape.main import create_app


@pytest.fixture
def stub_client() -> Generator[TestClient, None, None]:
    """`FEATURE_FLAG_MODE=stub` で組み立てたアプリのクライアント。

    ambient な `main.app`（開発者ローカルの `.env` の値に左右されうる）ではなく、
    テストコード内で明示構築した設定を使う（`auth/tests/test_dev_router.py` の
    `real_client` と同じ方針。R7: `_lifespan` を走らせるため `with TestClient(...)` が必須）。
    """
    settings = Settings(
        env="test",
        feature_flag_mode="stub",
        feature_flag_stub_document=json.dumps(
            {
                "app_config_probe": {"enabled": True},
                "client_requirements": {
                    "enabled": True,
                    "ios_minimum_version": "1.2.3",
                    "android_minimum_version": "1.2.4",
                },
            }
        ),
    )
    app = create_app(settings)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def empty_stub_client() -> Generator[TestClient, None, None]:
    settings = Settings(env="test", feature_flag_mode="stub", feature_flag_stub_document="")
    app = create_app(settings)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def unconfigured_client() -> Generator[TestClient, None, None]:
    """`FEATURE_FLAG_MODE=real` かつ `APPCONFIG_*` 未設定（コード既定と同値）。

    CI・既存開発者の `.env` で最も起きやすい状態（構造的に AWS を呼ばない）を固定する。
    """
    settings = Settings(env="test")
    app = create_app(settings)
    with TestClient(app) as test_client:
        yield test_client


def test_get_app_config_returns_200_without_authentication(stub_client: TestClient) -> None:
    response = stub_client.get("/app-config")
    assert response.status_code == 200


def test_get_app_config_response_shape(stub_client: TestClient) -> None:
    response = stub_client.get("/app-config")
    body = response.json()
    assert body == {
        "flags": {"app_config_probe": True},
        "minimum_supported_versions": {"ios": "1.2.3", "android": "1.2.4"},
        "config_source": "stub",
    }


def test_get_app_config_sets_cache_control_no_store(stub_client: TestClient) -> None:
    response = stub_client.get("/app-config")
    assert response.headers["Cache-Control"] == "no-store"


def test_get_app_config_reflects_changes_to_stub_document() -> None:
    settings = Settings(
        env="test",
        feature_flag_mode="stub",
        feature_flag_stub_document=json.dumps({"app_config_probe": {"enabled": False}}),
    )
    app = create_app(settings)
    with TestClient(app) as client:
        response = client.get("/app-config")
    assert response.json()["flags"] == {"app_config_probe": False}


def test_get_app_config_with_empty_stub_document_returns_all_off(
    empty_stub_client: TestClient,
) -> None:
    response = empty_stub_client.get("/app-config")
    body = response.json()
    assert body == {
        "flags": {"app_config_probe": False},
        "minimum_supported_versions": {"ios": None, "android": None},
        "config_source": "stub",
    }


def test_get_app_config_falls_back_to_default_when_appconfig_unconfigured(
    unconfigured_client: TestClient,
) -> None:
    """FEATURE_FLAG_MODE / APPCONFIG_* が共に未設定でも AWS を呼ばずに動く
    （CI・既存開発者の `.env` を壊さないための構造的な安全策。プラン テスト#10 の router 版）。
    """
    response = unconfigured_client.get("/app-config")
    body = response.json()
    assert body == {
        "flags": {"app_config_probe": False},
        "minimum_supported_versions": {"ios": None, "android": None},
        "config_source": "default",
    }
