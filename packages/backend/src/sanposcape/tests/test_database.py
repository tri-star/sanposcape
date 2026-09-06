"""`database.py` の遅延生成契約（決定1）の回帰テスト。

Lambda ではシークレットのハイドレーション（`core.runtime_config`）を
`sanposcape.main` の import より前に完了させる必要があり、そのためには
`sanposcape.database` の import 時点で engine を確定させてはいけない
（`Settings`/DB接続先が固まる前に接続してしまうため）。
ここでは import 時に `create_engine` が呼ばれないこと、`get_engine()` を
呼んで初めて 1 回だけ呼ばれることを固定する。
"""

import importlib.util
import sys
from types import ModuleType

import pytest
import sqlalchemy


def _fresh_import_database_module(module_alias: str) -> ModuleType:
    """`sanposcape.database` を新しい module オブジェクトとして読み込む。

    collection フェーズで多数のモジュールが既に `sanposcape.database` を import
    済みのため、単に `import sanposcape.database` するだけではキャッシュされた
    既存モジュールが返り、「import 時点の副作用」を検査できない。別名の一時
    module として exec することで、他コードが参照している `Base` 等を汚染せずに
    import 時の挙動だけを検査する（実行後は `sys.modules` に残さない）。
    """
    spec = importlib.util.find_spec("sanposcape.database")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_alias] = module
    try:
        spec.loader.exec_module(module)
    finally:
        sys.modules.pop(module_alias, None)
    return module


def test_import_does_not_create_engine(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[object] = []
    monkeypatch.setattr(
        sqlalchemy, "create_engine", lambda *args, **kwargs: calls.append((args, kwargs))
    )

    _fresh_import_database_module("sanposcape._database_import_probe")

    assert calls == []


def test_get_engine_creates_engine_once_and_caches(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[object] = []
    sentinel = object()

    def _fake_create_engine(*args: object, **kwargs: object) -> object:
        calls.append((args, kwargs))
        return sentinel

    monkeypatch.setattr(sqlalchemy, "create_engine", _fake_create_engine)

    module = _fresh_import_database_module("sanposcape._database_engine_probe")

    engine1 = module.get_engine()
    engine2 = module.get_engine()

    assert engine1 is sentinel
    assert engine1 is engine2
    assert len(calls) == 1


def test_get_session_factory_binds_to_get_engine(monkeypatch: pytest.MonkeyPatch) -> None:
    sentinel = object()
    monkeypatch.setattr(sqlalchemy, "create_engine", lambda *args, **kwargs: sentinel)

    module = _fresh_import_database_module("sanposcape._database_session_factory_probe")

    factory = module.get_session_factory()

    assert factory.kw["bind"] is sentinel
