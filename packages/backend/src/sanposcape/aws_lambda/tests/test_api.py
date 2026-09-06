"""`aws_lambda/api.py` のハイドレーション順序と Mangum 疎通の回帰テスト。"""

import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType

import pytest

import sanposcape.config as config_module
import sanposcape.core.runtime_config as runtime_config_module

_EVENTS_DIR = Path(__file__).resolve().parents[4] / "events"


def _fresh_exec_module(module_name: str, alias: str) -> ModuleType:
    """`module_name` を新しい module オブジェクトとして読み込む（`sys.modules` には残さない）。"""
    spec = importlib.util.find_spec(module_name)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[alias] = module
    try:
        spec.loader.exec_module(module)
    finally:
        sys.modules.pop(alias, None)
    return module


def test_hydration_runs_before_main_app_is_created(monkeypatch: pytest.MonkeyPatch) -> None:
    """決定1の暗黙契約（ハイドレーション→`sanposcape.main` import の順）を機械化する。

    `sanposcape.main` を collection フェーズの import から独立させて再実行させ、
    `hydrate_environment_from_secret()` と `create_app()` 内部の `get_settings()` の
    呼び出し順を記録して固定する。
    """
    monkeypatch.delenv("APP_SECRET_ARN", raising=False)  # hydrate() を no-op のまま安全に呼ぶ

    call_order: list[str] = []
    original_hydrate = runtime_config_module.hydrate_environment_from_secret
    original_get_settings = config_module.get_settings

    def _spy_hydrate() -> None:
        call_order.append("hydrate_environment_from_secret")
        original_hydrate()

    def _spy_get_settings() -> config_module.Settings:
        call_order.append("main_create_app_get_settings")
        return original_get_settings()

    monkeypatch.setattr(runtime_config_module, "hydrate_environment_from_secret", _spy_hydrate)
    monkeypatch.setattr(config_module, "get_settings", _spy_get_settings)

    # `sanposcape.main` を collection 時のキャッシュから外し、`aws_lambda.api` の
    # `from sanposcape.main import app` で実際に再 import（= create_app() の再実行）が
    # 起きるようにする。他のテストへの影響を避けるため、終了後に必ず元へ戻す。
    original_main_module = sys.modules.get("sanposcape.main")
    sys.modules.pop("sanposcape.main", None)
    try:
        _fresh_exec_module("sanposcape.aws_lambda.api", "sanposcape._aws_lambda_api_order_probe")
    finally:
        if original_main_module is not None:
            sys.modules["sanposcape.main"] = original_main_module
        else:
            sys.modules.pop("sanposcape.main", None)

    assert call_order == ["hydrate_environment_from_secret", "main_create_app_get_settings"]


def test_handler_returns_200_for_health_check() -> None:
    """`events/health-get.json`（payload format 2.0）を渡すと Mangum 経由で 200 が返る。"""
    from sanposcape.aws_lambda.api import handler

    event = json.loads((_EVENTS_DIR / "health-get.json").read_text())

    response = handler(event, None)

    assert response["statusCode"] == 200
    assert json.loads(response["body"]) == {"status": "ok"}
