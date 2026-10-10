"""`aws_lambda/runtime_logging.py`（ランタイムのログハンドラーの JSON 化）のテスト。"""

import logging
from collections.abc import Generator

import pytest

from sanposcape.aws_lambda.runtime_logging import use_json_format_for_runtime_handlers
from sanposcape.core.observability import JsonLogFormatter


@pytest.fixture
def runtime_handler() -> Generator[logging.Handler, None, None]:
    """Lambda のランタイムが root に付けるハンドラーの代役（テキスト形式）。"""
    handler = logging.NullHandler()
    original = logging.Formatter("[%(levelname)s]\t%(message)s")
    handler.setFormatter(original)
    root = logging.getLogger()
    root.addHandler(handler)
    yield handler
    root.removeHandler(handler)


def test_does_nothing_outside_lambda(
    monkeypatch: pytest.MonkeyPatch, runtime_handler: logging.Handler
) -> None:
    """pytest の root のハンドラー（caplog など）の書式を書き換えないための条件。"""
    monkeypatch.delenv("AWS_LAMBDA_FUNCTION_NAME", raising=False)
    before = runtime_handler.formatter

    use_json_format_for_runtime_handlers()

    assert runtime_handler.formatter is before
    assert not isinstance(runtime_handler.formatter, JsonLogFormatter)


def test_replaces_the_formatter_of_every_root_handler_in_lambda(
    monkeypatch: pytest.MonkeyPatch, runtime_handler: logging.Handler
) -> None:
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "sanposcape-dev-backend-api")
    root = logging.getLogger()
    saved = {handler: handler.formatter for handler in root.handlers}
    try:
        handlers_before = list(root.handlers)

        use_json_format_for_runtime_handlers()

        assert root.handlers == handlers_before  # ハンドラーは足しも外しもしない
        assert all(isinstance(h.formatter, JsonLogFormatter) for h in root.handlers)
    finally:
        for handler, formatter in saved.items():
            handler.setFormatter(formatter)


def test_does_nothing_when_root_has_no_handler(monkeypatch: pytest.MonkeyPatch) -> None:
    """ハンドラーが無ければ足さない（`configure_logging()` が `sanposcape` に足す経路に任せる）。"""
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "sanposcape-dev-backend-api")
    root = logging.getLogger()
    saved = root.handlers
    root.handlers = []
    try:
        use_json_format_for_runtime_handlers()
        assert root.handlers == []
    finally:
        root.handlers = saved
