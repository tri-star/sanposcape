"""template.yaml / compose.yaml のトレース設定の整合を検証する（ADR-013 / SS-178）。

`OTEL_PYTHON_DISABLED_INSTRUMENTATIONS` はレイヤーの既定値に `urllib` を足した文字列で、
自動計装を botocore だけにする。fastapi / sqlalchemy / httpx / urllib / threading は
アプリから手動で計装する（urllib はクエリを除くフックのため）。
自動と手動の二重計装を避けるため、この 5 つが無効リストに含まれていることを固定する。
"""

import pytest
import yaml

from sanposcape.tests.template_loader import BACKEND_DIR, load_resources

_MANUALLY_INSTRUMENTED = {"fastapi", "sqlalchemy", "httpx", "urllib", "threading"}
_AUTO_INSTRUMENTED = {"botocore"}


def _template_disabled() -> str:
    variables = load_resources()["Api"]["Properties"]["Environment"]["Variables"]
    return variables["OTEL_PYTHON_DISABLED_INSTRUMENTATIONS"]


def _compose_disabled() -> str:
    compose = yaml.safe_load((BACKEND_DIR / "compose.yaml").read_text())
    return compose["services"]["api"]["environment"]["OTEL_PYTHON_DISABLED_INSTRUMENTATIONS"]


@pytest.mark.parametrize("source", [_template_disabled, _compose_disabled])
def test_manual_instrumentations_are_disabled_for_auto_instrumentation(source) -> None:
    disabled = set(source().split(","))

    assert disabled >= _MANUALLY_INSTRUMENTED
    assert not (_AUTO_INSTRUMENTED & disabled)


def test_template_and_compose_use_the_same_disabled_list() -> None:
    assert _template_disabled() == _compose_disabled()


def test_migrate_function_is_not_traced() -> None:
    properties = load_resources()["Migrate"]["Properties"]

    assert "Layers" not in properties
    assert "Tracing" not in properties
    assert "AWS_LAMBDA_EXEC_WRAPPER" not in str(properties.get("Environment", {}))
