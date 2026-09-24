import json
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from sanposcape.app_config.dependencies import get_feature_flags
from sanposcape.config import Settings
from sanposcape.core.feature_flags import FeatureFlags
from sanposcape.integrations.aws.appconfig import FlagDocument
from sanposcape.main import create_app


class _CountingFlagDocumentSource:
    """`get_document()` の呼び出し回数を数える手書きフェイク。"""

    def __init__(self, document: FlagDocument) -> None:
        self._document = document
        self.call_count = 0

    def get_document(self) -> FlagDocument:
        self.call_count += 1
        return self._document


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
                "pin_registration": {"enabled": True},
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
        "flags": {"pin_registration": True},
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
        feature_flag_stub_document=json.dumps({"pin_registration": {"enabled": False}}),
    )
    app = create_app(settings)
    with TestClient(app) as client:
        response = client.get("/app-config")
    assert response.json()["flags"] == {"pin_registration": False}


def test_get_app_config_with_empty_stub_document_returns_all_off(
    empty_stub_client: TestClient,
) -> None:
    response = empty_stub_client.get("/app-config")
    body = response.json()
    assert body == {
        "flags": {"pin_registration": False},
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
        "flags": {"pin_registration": False},
        "minimum_supported_versions": {"ios": None, "android": None},
        "config_source": "default",
    }


def test_get_app_config_calls_get_document_only_once_per_request() -> None:
    """`flags.minimum_supported_versions()` / `client_flags()` / `source_kind()` が
    それぞれ独立に `get_document()` を呼ぶと、`AppConfigFlagSource` ではロック取得が
    1リクエストあたり3回発生し、理論上ポーリング間隔の境界をまたぐと `flags` と
    `minimum_supported_versions` が異なる世代のドキュメントに基づく不整合が起こり得た
    （local-review F-12）。router が1回だけ取得して使い回すことを固定する。
    """
    settings = Settings(env="test", feature_flag_mode="stub")
    app = create_app(settings)
    source = _CountingFlagDocumentSource(
        FlagDocument({"pin_registration": {"enabled": True}}, kind="stub")
    )
    app.dependency_overrides[get_feature_flags] = lambda: FeatureFlags(source)
    try:
        with TestClient(app) as client:
            response = client.get("/app-config")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert source.call_count == 1
