"""`aws_lambda/runtime_logging.py`（ランタイムのログハンドラーの JSON 化）のテスト。"""

import logging
from collections.abc import Generator

import pytest

from sanposcape.aws_lambda import runtime_logging
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


def test_does_not_add_a_handler_when_root_has_none_and_warns_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """ハンドラーが無ければ足さない（`configure_logging()` が `sanposcape` に足す経路に任せる）。
    ただしランタイムが必ず付けるはずなので、静かに失敗しないよう WARNING を 1 回出す。

    root にハンドラーが無い状態で出力を拾えないため、logger の呼び出しを記録して確認する。
    """
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "sanposcape-dev-backend-api")
    monkeypatch.setattr(runtime_logging, "_warned_no_handler", False)
    warnings: list[str] = []
    monkeypatch.setattr(runtime_logging.logger, "warning", lambda message: warnings.append(message))

    root = logging.getLogger()
    saved = root.handlers
    root.handlers = []  # pytest が各フェーズで付けるハンドラーを、テスト本体の中で外す
    try:
        use_json_format_for_runtime_handlers()
        use_json_format_for_runtime_handlers()
        assert root.handlers == []
    finally:
        root.handlers = saved

    assert len(warnings) == 1
    assert "JSON 化を行わない" in warnings[0]


def test_does_not_reapply_to_a_handler_that_already_uses_the_json_formatter(
    monkeypatch: pytest.MonkeyPatch, runtime_handler: logging.Handler
) -> None:
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "sanposcape-dev-backend-api")
    root = logging.getLogger()
    saved = {handler: handler.formatter for handler in root.handlers}
    try:
        use_json_format_for_runtime_handlers()
        first = runtime_handler.formatter
        use_json_format_for_runtime_handlers()

        assert isinstance(first, JsonLogFormatter)
        assert runtime_handler.formatter is first  # 冪等: 作り直さない
    finally:
        for handler, formatter in saved.items():
            handler.setFormatter(formatter)


def test_replaces_every_handler_when_the_runtime_attached_several(
    monkeypatch: pytest.MonkeyPatch, runtime_handler: logging.Handler
) -> None:
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "sanposcape-dev-backend-api")
    second = logging.NullHandler()
    second.setFormatter(logging.Formatter("%(message)s"))
    root = logging.getLogger()
    root.addHandler(second)
    saved = {handler: handler.formatter for handler in root.handlers}
    try:
        use_json_format_for_runtime_handlers()

        assert isinstance(runtime_handler.formatter, JsonLogFormatter)
        assert isinstance(second.formatter, JsonLogFormatter)
    finally:
        root.removeHandler(second)
        for handler, formatter in saved.items():
            handler.setFormatter(formatter)
