"""`aws_lambda/api.py` のハイドレーション順序と Mangum 疎通の回帰テスト。"""

import asyncio
import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType

import pytest

import sanposcape
import sanposcape.aws_lambda
import sanposcape.aws_lambda.asgi_handler as asgi_handler_module
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

    # `build_handler()` は lifespan を起動する。ここでは捨てられる app を作るだけなので、
    # 実際には起動せず呼び出しだけを記録する（起動すると、GC された async generator の
    # finalizer が後のテストのループ上で `aclose()` を走らせ、無関係のテストに紛れ込む）。
    # fresh exec の `from ... import build_handler` は実行時に属性を読むので、exec より前に
    # 差し替えれば spy が使われる。
    def _spy_build_handler(app: object) -> object:
        call_order.append("build_handler")
        return object()

    monkeypatch.setattr(asgi_handler_module, "build_handler", _spy_build_handler)

    # `sanposcape.main` を collection 時のキャッシュから外し、`aws_lambda.api` の
    # `from sanposcape.main import app` で実際に再 import（= create_app() の再実行）が
    # 起きるようにする。再 import は親パッケージの属性 `sanposcape.main` も新しい module で
    # 上書きするので、`sys.modules` と属性の両方を monkeypatch で戻す（失敗経路でも teardown で
    # 確実に戻る。戻さないと、`monkeypatch.setattr("sanposcape.main.x")` のような文字列指定が
    # 後続のテストで古い module オブジェクトを指してしまう）。
    monkeypatch.setattr(sanposcape, "main", sanposcape.main)
    monkeypatch.delitem(sys.modules, "sanposcape.main")
    _fresh_exec_module("sanposcape.aws_lambda.api", "sanposcape._aws_lambda_api_order_probe")

    # lifespan の起動（build_handler）は app の生成（create_app の get_settings）より後。
    assert call_order == [
        "hydrate_environment_from_secret",
        "main_create_app_get_settings",
        "build_handler",
    ]


def test_handler_returns_200_for_health_check(
    lambda_event_loop: asyncio.AbstractEventLoop,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`events/health-get.json`（payload format 2.0）を渡すと Mangum 経由で 200 が返り、
    同じハンドラーを2回呼んでも同じ結果になる。

    実際の `api.py` を import すると、共有の `sanposcape.main.app` で lifespan が起動する。
    テスト終了後に「閉じたループを持つ handler」や「未 close の lifespan」が残らないよう、
    import を隔離し（`sys.modules` と親パッケージの属性 `api`）、`handler.close()` してから
    ループを閉じる。
    """
    monkeypatch.setattr(sanposcape.aws_lambda, "api", None, raising=False)
    monkeypatch.delitem(sys.modules, "sanposcape.aws_lambda.api", raising=False)
    from sanposcape.aws_lambda.api import handler

    try:
        event = json.loads((_EVENTS_DIR / "health-get.json").read_text())

        for _ in range(2):
            response = handler(event, None)

            assert response["statusCode"] == 200
            assert json.loads(response["body"]) == {"status": "ok"}
    finally:
        handler.close()
        # 元々 import 済みでなかった場合に備え、import が残した痕跡を取り除く。元々あった
        # 場合は monkeypatch が teardown で戻す（親パッケージの属性 `api` も同様）。
        sys.modules.pop("sanposcape.aws_lambda.api", None)
