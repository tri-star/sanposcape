"""`core/observability.py`（再エクスポートのファサード）のテスト。

実体は `core/logs.py` / `core/access_log.py` / `core/tracing.py` にあり、それぞれのテストは
`test_logs.py` / `test_access_log.py` / `test_tracing.py` にある。ここでは分割の契約
（公開名の同一性・OTel を import しない・依存方向）だけを固定する。
"""

import ast
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

from sanposcape.core import access_log, logs, observability, tracing

CORE_DIR = Path(__file__).resolve().parents[1]

# 分割前の `core/observability.py` が公開していた名前（再エクスポートで維持する）。
EXPECTED_PUBLIC_NAMES = {
    "AccessLogMiddleware",
    "ConsoleLogFormatter",
    "JsonLogFormatter",
    "LogContext",
    "TraceLookup",
    "UnhandledErrorAfterResponseStart",
    "bind_user_id",
    "blank_privacy_sensitive_attributes",
    "configure_logging",
    "current_span_attributes",
    "instrument_fastapi_app",
    "instrument_sqlalchemy_engine",
    "log_context",
    "record_exception_on_current_span",
    "resolve_route_template",
    "set_span_attributes",
    "warn_once",
}


def test_public_names_are_the_expected_ones() -> None:
    assert set(observability.__all__) == EXPECTED_PUBLIC_NAMES


@pytest.mark.parametrize("name", sorted(EXPECTED_PUBLIC_NAMES))
def test_each_public_name_is_the_same_object_as_its_implementation(name: str) -> None:
    exported = getattr(observability, name)
    owners = [m for m in (logs, access_log, tracing) if hasattr(m, name)]

    assert owners, f"{name} がどのモジュールにも無い"
    assert any(getattr(m, name) is exported for m in owners)


@pytest.mark.parametrize("name", ["_LOG_OPTIONS", "_WARNED", "_MAX_MESSAGE_CHARS", "_log_context"])
def test_private_names_are_not_reexported(name: str) -> None:
    # 再エクスポートした名前への monkeypatch は実体に効かない。AttributeError で気づけるようにする。
    assert not hasattr(observability, name)


def test_all_logger_names_stay_the_same_as_before_the_split() -> None:
    assert tracing.logger.name == "sanposcape.core.observability"
    assert logs.logger.name == "sanposcape.core.observability"
    assert access_log.logger.name == "sanposcape.core.observability"


def test_importing_the_facade_does_not_import_opentelemetry() -> None:
    code = (
        "import sys\n"
        "import sanposcape.core.observability\n"
        "loaded = sorted(m for m in sys.modules if m.split('.')[0] == 'opentelemetry')\n"
        "assert not loaded, loaded\n"
    )
    env = {"PYTHONPATH": str(CORE_DIR.parents[1])}

    result = subprocess.run(
        [sys.executable, "-c", code],
        env=env,
        cwd=tempfile.gettempdir(),
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr


def _imported_modules(path: Path) -> set[str]:
    """ファイルが import するモジュール名（`from X import Y` は `X` と `X.Y` の両方）。"""
    modules: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            modules.add(node.module)
            modules.update(f"{node.module}.{alias.name}" for alias in node.names)
    return modules


@pytest.mark.parametrize(
    ("module_file", "forbidden"),
    [
        ("tracing.py", {"logs", "access_log", "observability"}),
        ("logs.py", {"access_log", "observability"}),
        ("access_log.py", {"observability"}),
    ],
)
def test_dependency_direction_is_access_log_to_logs_to_tracing(
    module_file: str, forbidden: set[str]
) -> None:
    imported = _imported_modules(CORE_DIR / module_file)

    violations = {f"sanposcape.core.{name}" for name in forbidden} & imported
    assert not violations, f"{module_file} が上位のモジュールを import している: {violations}"


def test_dependency_check_detects_a_violation(tmp_path: Path) -> None:
    # 検査自体が空振りしていないことの確認（違反を注入して検出されること）。
    bad = tmp_path / "bad.py"
    bad.write_text("from sanposcape.core import logs\n", encoding="utf-8")

    assert "sanposcape.core.logs" in _imported_modules(bad)
