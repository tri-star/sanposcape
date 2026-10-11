import ast
import contextvars
import json
import logging
import sys
import uuid
from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy.exc import IntegrityError

from sanposcape.core import logs
from sanposcape.core.logs import (
    ConsoleLogFormatter,
    JsonLogFormatter,
    LogContext,
    bind_user_id,
    configure_logging,
    current_span_attributes,
    log_context,
)

_USER_ID = uuid.UUID("11111111-2222-4333-8444-555555555555")


@pytest.fixture
def json_formatter() -> JsonLogFormatter:
    # 周囲の設定（`.env` が ENV=local なら ambient な `main.app` は例外メッセージを出す設定）に
    # 依存しないよう、安全側の既定へ揃える（teardown は conftest の `_restore_log_options`）。
    logs._LOG_OPTIONS.include_exception_messages = False
    logs._LOG_OPTIONS.trace_lookup = None
    return JsonLogFormatter()


def _record(
    message: str = "hello",
    *,
    level: int = logging.INFO,
    args: tuple[object, ...] = (),
    exc: BaseException | None = None,
    **extra: object,
) -> logging.LogRecord:
    exc_info = (type(exc), exc, exc.__traceback__) if exc is not None else None
    record = logging.LogRecord("sanposcape.x", level, __file__, 1, message, args, exc_info)
    for key, value in extra.items():
        setattr(record, key, value)
    return record


def _raise(exc: BaseException) -> BaseException:
    try:
        raise exc
    except BaseException as caught:
        return caught


class TestJsonLogFormatter:
    def test_emits_the_basic_fields_on_one_line(self, json_formatter: JsonLogFormatter) -> None:
        line = json_formatter.format(_record("count=%d", args=(3,)))

        assert "\n" not in line
        payload = json.loads(line)
        assert payload["level"] == "INFO"
        assert payload["logger"] == "sanposcape.x"
        assert payload["message"] == "count=3"
        assert payload["timestamp"].endswith("Z")
        assert len(payload["timestamp"]) == len("2026-10-10T03:12:45.123Z")

    def test_does_not_escape_non_ascii_characters(self, json_formatter: JsonLogFormatter) -> None:
        line = json_formatter.format(_record("散歩を開始"))

        assert "散歩を開始" in line

    def test_multiline_message_stays_on_one_line(self, json_formatter: JsonLogFormatter) -> None:
        line = json_formatter.format(_record("a\nb"))

        assert "\n" not in line
        assert json.loads(line)["message"] == "a\nb"

    def test_only_allowlisted_extras_are_emitted(self, json_formatter: JsonLogFormatter) -> None:
        payload = json.loads(
            json_formatter.format(
                _record(
                    log_type="access",
                    http_status_code=200,
                    duration_ms=1.5,
                    password="p@ss",
                    request={"token": "t"},
                )
            )
        )

        assert payload["log_type"] == "access"
        assert payload["http_status_code"] == 200
        assert payload["duration_ms"] == 1.5
        assert "password" not in payload and "request" not in payload

    def test_overlong_message_is_truncated_and_flagged(
        self, json_formatter: JsonLogFormatter, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(logs, "_MAX_MESSAGE_CHARS", 5)

        payload = json.loads(json_formatter.format(_record("abcdefghij")))

        assert payload["message"] == "abcde"
        assert payload["message_truncated"] is True

    def test_short_message_is_not_flagged(self, json_formatter: JsonLogFormatter) -> None:
        assert "message_truncated" not in json.loads(json_formatter.format(_record("hello")))

    def test_oversized_line_drops_the_stacktrace_but_keeps_the_rest(
        self, json_formatter: JsonLogFormatter, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(logs, "_MAX_LOG_LINE_BYTES", 300)
        monkeypatch.setattr(logs, "_MAX_MESSAGE_CHARS", 10_000)

        line = json_formatter.format(_record("x" * 100, exc=_raise(RuntimeError("boom"))))

        payload = json.loads(line)
        assert payload["exception_type"] == "RuntimeError"
        assert payload["exception_stacktrace"] == ["... (omitted: log line too large)"]
        assert payload["exception_stacktrace_truncated"] is True
        assert payload["message"] == "x" * 100

    def test_non_serializable_extra_falls_back_to_str(
        self, json_formatter: JsonLogFormatter
    ) -> None:
        payload = json.loads(json_formatter.format(_record(log_type=object)))

        assert payload["log_type"].startswith("<class")

    def test_formatting_failure_degrades_to_a_minimal_json_line(
        self, json_formatter: JsonLogFormatter
    ) -> None:
        # 引数の数が合わず getMessage() が失敗する
        line = json_formatter.format(_record("%d %d", args=(1,)))

        assert json.loads(line) == {
            "level": "INFO",
            "logger": "sanposcape.x",
            "message": "log formatting failed",
            "exception_type": "TypeError",
        }

    def test_context_fields_are_included_only_when_present(
        self, json_formatter: JsonLogFormatter
    ) -> None:
        assert "user_id" not in json.loads(json_formatter.format(_record()))

        with log_context(aws_request_id="req-1", http_method="GET"):
            bind_user_id(_USER_ID)
            payload = json.loads(json_formatter.format(_record()))

        assert payload["aws_request_id"] == "req-1"
        assert payload["http_method"] == "GET"
        assert payload["user_id"] == str(_USER_ID)
        assert "http_route" not in payload

    def test_trace_fields_come_from_the_lookup_when_tracing_is_enabled(
        self, json_formatter: JsonLogFormatter
    ) -> None:
        logs._LOG_OPTIONS.trace_lookup = lambda: ("a" * 32, "b" * 16, True)

        payload = json.loads(json_formatter.format(_record()))

        assert payload["trace_id"] == "a" * 32
        assert payload["span_id"] == "b" * 16
        assert payload["trace_sampled"] is True

    def test_no_trace_fields_without_a_valid_span(self, json_formatter: JsonLogFormatter) -> None:
        logs._LOG_OPTIONS.trace_lookup = lambda: None

        assert "trace_id" not in json.loads(json_formatter.format(_record()))

    def test_a_failing_trace_lookup_does_not_break_the_log(
        self, json_formatter: JsonLogFormatter
    ) -> None:
        def broken() -> tuple[str, str, bool]:
            raise RuntimeError

        logs._LOG_OPTIONS.trace_lookup = broken

        payload = json.loads(json_formatter.format(_record("still logged")))

        assert payload["message"] == "still logged"


class _FakeDbapiError(Exception):
    sqlstate = "23505"


class TestExceptionFields:
    def test_type_stacktrace_and_no_message_by_default(
        self, json_formatter: JsonLogFormatter
    ) -> None:
        exc = _raise(RuntimeError("secret-xyz"))

        line = json_formatter.format(_record(exc=exc))

        payload = json.loads(line)
        assert payload["exception_type"] == "RuntimeError"
        assert isinstance(payload["exception_stacktrace"], list)
        assert any("test_logs.py" in row for row in payload["exception_stacktrace"])
        assert "exception_message" not in payload
        assert "secret-xyz" not in line  # どの値にも現れない

    def test_message_is_emitted_when_enabled(self, json_formatter: JsonLogFormatter) -> None:
        logs._LOG_OPTIONS.include_exception_messages = True
        exc = _raise(RuntimeError("secret-xyz"))

        payload = json.loads(json_formatter.format(_record(exc=exc)))

        assert payload["exception_message"] == "secret-xyz"

    def test_non_builtin_exception_type_is_module_qualified(
        self, json_formatter: JsonLogFormatter
    ) -> None:
        exc = _raise(IntegrityError("stmt", {}, _FakeDbapiError("DETAIL: Key (sub)=(abc)")))

        payload = json.loads(json_formatter.format(_record(exc=exc)))

        assert payload["exception_type"] == "sqlalchemy.exc.IntegrityError"
        assert payload["exception_sqlstate"] == "23505"

    def test_chained_exceptions_list_both_types_but_no_messages(
        self, json_formatter: JsonLogFormatter
    ) -> None:
        # ソースの行（コード）はスタックトレースに出るため、メッセージは実行時に組み立てる
        cause_message = "-".join(["cause", "secret"])
        outer_message = "-".join(["outer", "secret"])
        try:
            try:
                raise ValueError(cause_message)
            except ValueError as cause:
                raise KeyError(outer_message) from cause
        except KeyError as outer:
            exc = outer

        line = json_formatter.format(_record(exc=exc))

        rows = json.loads(line)["exception_stacktrace"]
        assert "ValueError" in rows and "KeyError" in rows
        assert rows.index("ValueError") < rows.index("KeyError")
        assert any("direct cause" in row for row in rows)
        assert "cause-secret" not in line and "outer-secret" not in line

    def test_suppressed_context_is_not_followed(self, json_formatter: JsonLogFormatter) -> None:
        try:
            try:
                raise ValueError("hidden")
            except ValueError:
                raise KeyError("shown") from None
        except KeyError as outer:
            exc = outer

        rows = json.loads(json_formatter.format(_record(exc=exc)))["exception_stacktrace"]

        assert "ValueError" not in rows

    def test_long_stacktrace_is_truncated_and_flagged(
        self, json_formatter: JsonLogFormatter, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(logs, "_MAX_STACKTRACE_LINES", 3)

        payload = json.loads(json_formatter.format(_record(exc=_raise(RuntimeError()))))

        assert len(payload["exception_stacktrace"]) == 3
        assert payload["exception_stacktrace_truncated"] is True

    def test_truncation_keeps_the_tail_with_the_final_exception_type(
        self, json_formatter: JsonLogFormatter, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """送出箇所と最終例外の型名は末尾にある。切るなら先頭側（外側のフレーム）を省く。"""
        monkeypatch.setattr(logs, "_MAX_STACKTRACE_LINES", 3)

        payload = json.loads(json_formatter.format(_record(exc=_raise(KeyError("k")))))

        rows = payload["exception_stacktrace"]
        assert len(rows) == 3
        assert rows[0].startswith("... (") and "omitted" in rows[0]
        assert rows[-1] == "KeyError"
        assert payload["exception_stacktrace_truncated"] is True

    def test_exception_chain_cap_drops_the_oldest_causes(
        self, json_formatter: JsonLogFormatter, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(logs, "_MAX_EXCEPTION_CHAIN", 2)
        try:
            try:
                try:
                    raise ValueError("oldest")
                except ValueError as first:
                    raise KeyError("middle") from first
            except KeyError as second:
                raise RuntimeError("newest") from second
        except RuntimeError as outer:
            exc = outer

        rows = json.loads(json_formatter.format(_record(exc=exc)))["exception_stacktrace"]

        assert "ValueError" not in rows
        assert rows[-1] == "RuntimeError" and "KeyError" in rows

    def test_short_stacktrace_is_not_flagged(self, json_formatter: JsonLogFormatter) -> None:
        payload = json.loads(json_formatter.format(_record(exc=_raise(RuntimeError()))))

        assert "exception_stacktrace_truncated" not in payload

    def test_local_variables_are_not_emitted(self, json_formatter: JsonLogFormatter) -> None:
        def inner() -> None:
            secret_local = "local-value-123"  # noqa: F841
            raise RuntimeError

        try:
            inner()
        except RuntimeError as caught:
            exc = caught

        assert "local-value-123" not in json_formatter.format(_record(exc=exc))


class TestConsoleLogFormatter:
    def test_one_line_with_context_suffix(self) -> None:
        formatter = ConsoleLogFormatter()
        with log_context(http_method="GET"):
            line = formatter.format(_record("hello"))

        assert "INFO  sanposcape.x: hello" in line
        assert line.endswith("[http_method=GET]")

    def test_exception_is_rendered_as_a_standard_traceback(self) -> None:
        line = ConsoleLogFormatter().format(_record(exc=_raise(RuntimeError("visible-locally"))))

        assert "Traceback" in line and "RuntimeError: visible-locally" in line


class TestLogContext:
    def test_existing_context_is_extended_not_replaced_and_not_reset(self) -> None:
        with log_context(aws_request_id="req-1") as outer:
            with log_context(http_method="GET") as inner:
                assert inner is outer
            # 内側の終了で reset されない
            assert logs._log_context.get() is outer
            assert outer.aws_request_id == "req-1" and outer.http_method == "GET"
        assert logs._log_context.get() is None

    def test_none_values_do_not_overwrite(self) -> None:
        with log_context(aws_request_id="req-1") as ctx:
            with log_context(aws_request_id=None):
                pass
            assert ctx.aws_request_id == "req-1"

    def test_bind_user_id_without_a_context_is_a_noop(self) -> None:
        bind_user_id(_USER_ID)  # 例外にならない

        assert logs._log_context.get() is None

    def test_bind_user_id_sets_the_internal_uuid_as_a_string(self) -> None:
        with log_context() as ctx:
            bind_user_id(_USER_ID)

        assert ctx.user_id == str(_USER_ID)

    @pytest.mark.parametrize("not_a_uuid", ["a@example.com", str(_USER_ID), 123, None, b"x"])
    def test_bind_user_id_ignores_anything_but_a_uuid(
        self, not_a_uuid: Any, json_formatter: JsonLogFormatter
    ) -> None:
        with log_context(aws_request_id="req-1") as ctx:
            bind_user_id(not_a_uuid)  # 例外にならない
            line = json_formatter.format(_record())

        assert ctx.user_id is None
        assert "user_id" not in json.loads(line)
        assert "example.com" not in line

    def test_current_span_attributes_maps_log_context_fields_to_span_attribute_names(self) -> None:
        with log_context(http_method="GET", aws_request_id="req-1"):
            assert current_span_attributes() == {}  # 値が無ければ含めない
            bind_user_id(_USER_ID)
            assert current_span_attributes() == {"enduser.id": str(_USER_ID)}

    def test_current_span_attributes_is_empty_without_a_context(self) -> None:
        assert current_span_attributes() == {}

    def test_user_id_bound_in_a_copied_context_reaches_the_caller(self) -> None:
        """同期の依存はスレッドプール（context のコピー）で動く。可変オブジェクトなので届く。"""
        with log_context() as ctx:
            contextvars.copy_context().run(bind_user_id, _USER_ID)

        assert isinstance(ctx, LogContext) and ctx.user_id == str(_USER_ID)


# `JsonLogFormatter` が自分で付けるキー。`payload.update(_context_fields())` が後から上書きする
# ので、許可リスト・文脈のキーと重なると片方が黙って消える。
_BASE_KEYS = {
    "timestamp",
    "level",
    "logger",
    "message",
    "message_truncated",
    "trace_id",
    "span_id",
    "trace_sampled",
    "exception_type",
    "exception_stacktrace",
    "exception_stacktrace_truncated",
    "exception_sqlstate",
    "exception_message",
}
_SRC_DIR = Path(__file__).resolve().parents[2]
_LOG_METHODS = {"debug", "info", "warning", "warn", "error", "exception", "critical", "log"}


def _log_calls_with_extra() -> list[tuple[str, int, ast.keyword]]:
    """本番コード（tests を除く）の、ログ呼び出しの `extra=` 引数。"""
    found: list[tuple[str, int, ast.keyword]] = []
    for path in sorted(_SRC_DIR.rglob("*.py")):
        relative = path.relative_to(_SRC_DIR)
        if "tests" in relative.parts or path.name == "conftest.py":
            continue
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr in _LOG_METHODS
            ):
                found.extend(
                    (str(relative), node.lineno, kw) for kw in node.keywords if kw.arg == "extra"
                )
    return found


def _extra_key_violations(calls: list[tuple[str, int, ast.keyword]]) -> list[str]:
    """`extra=` の違反（dict リテラルでない・キーが文字列リテラルでない・許可リスト外）。"""
    violations: list[str] = []
    for file, line, keyword in calls:
        where = f"{file}:{line}"
        if not isinstance(keyword.value, ast.Dict):
            violations.append(f"{where}: extra= は dict リテラルにする")
            continue
        for key in keyword.value.keys:
            if not (isinstance(key, ast.Constant) and isinstance(key.value, str)):
                violations.append(f"{where}: extra= のキーは文字列リテラルにする")
            elif key.value not in logs._EXTRA_KEYS:
                violations.append(
                    f"{where}: {key.value!r} が _EXTRA_KEYS に無い（黙って捨てられる）"
                )
    return violations


class TestLogKeys:
    def test_log_context_keys_are_derived_from_the_dataclass_in_definition_order(self) -> None:
        assert logs._LOG_CONTEXT_KEYS == (
            "aws_request_id",
            "http_method",
            "http_route",
            "user_id",
            "app_session_id",
        )

    def test_scope_is_not_emitted(self, json_formatter: JsonLogFormatter) -> None:
        with log_context(http_method="GET", scope={"type": "http"}):
            payload = json.loads(json_formatter.format(_record()))

        assert "scope" not in payload
        assert payload["http_method"] == "GET"

    def test_extra_keys_are_the_allow_list(self) -> None:
        assert logs._EXTRA_KEYS == ("log_type", "http_status_code", "duration_ms")

    def test_extra_keys_context_keys_and_base_keys_do_not_overlap(self) -> None:
        groups = {
            "_EXTRA_KEYS": set(logs._EXTRA_KEYS),
            "_LOG_CONTEXT_KEYS": set(logs._LOG_CONTEXT_KEYS),
            "基本キー": _BASE_KEYS,
        }
        names = list(groups)
        for i, left in enumerate(names):
            for right in names[i + 1 :]:
                assert not groups[left] & groups[right], f"{left} と {right} が重なっている"

    def test_log_call_extra_keys_are_all_in_the_allow_list(self) -> None:
        calls = _log_calls_with_extra()
        assert calls, "extra= を使うログ呼び出しが 1 件も見つからない（検査が空振りしている）"

        assert _extra_key_violations(calls) == []

    def test_the_extra_check_detects_an_unknown_key(self) -> None:
        """本物の検査（`_extra_key_violations`）が違反を見つけられることを確かめる。"""
        tree = ast.parse(
            'logger.info("a", extra={"unknown_key": 1})\n'
            'logger.info("b", extra={"log_type": "access"})\n'
            'logger.info("c", extra=build())\n'
            'logger.info("d", extra={key: 1})\n'
        )
        calls = [
            ("x.py", node.lineno, kw)
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            for kw in node.keywords
            if kw.arg == "extra"
        ]

        violations = _extra_key_violations(calls)

        assert len(violations) == 3  # a（許可リスト外）/ c（dict リテラルでない）/ d（キーが変数）
        assert any("unknown_key" in v for v in violations)
        assert not any("log_type" in v for v in violations)

    def test_base_keys_cover_every_key_the_formatter_emits(
        self, json_formatter: JsonLogFormatter, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """`_BASE_KEYS`（手書き）が古くならないよう、出力のキーが 3 グループに収まるか見る。"""
        monkeypatch.setattr(logs, "_MAX_MESSAGE_CHARS", 5)
        logs._LOG_OPTIONS.include_exception_messages = True
        extra = dict.fromkeys(logs._EXTRA_KEYS, 1)
        with log_context(
            aws_request_id="r", http_method="GET", app_session_id="s", scope={"type": "http"}
        ):
            bind_user_id(_USER_ID)
            line = json_formatter.format(
                _record("long message", exc=_raise(RuntimeError("boom")), **extra)
            )

        known = _BASE_KEYS | set(logs._EXTRA_KEYS) | set(logs._LOG_CONTEXT_KEYS)
        assert set(json.loads(line)) <= known


@pytest.fixture
def app_logger_state() -> Generator[logging.Logger, None, None]:
    app_logger = logging.getLogger("sanposcape")
    root = logging.getLogger()
    # list は**コピー**して退避する（`addHandler` は同じ list を書き換えるため、参照のままだと
    # テスト中に足したハンドラーが復元後にも残ってリークする）。
    saved = (list(root.handlers), list(app_logger.handlers), app_logger.level)
    yield app_logger
    root.handlers, app_logger.handlers = saved[0], saved[1]
    app_logger.setLevel(saved[2])


class TestConfigureLogging:
    def test_sets_the_level_of_the_app_logger(self, app_logger_state: logging.Logger) -> None:
        configure_logging("WARNING")
        assert app_logger_state.level == logging.WARNING
        configure_logging("INFO")
        assert app_logger_state.level == logging.INFO

    def test_adds_one_handler_when_neither_root_nor_the_app_logger_has_one(
        self, app_logger_state: logging.Logger
    ) -> None:
        """ローカル（uvicorn）の経路。uvicorn は自分のロガーしか設定せず root は手付かずなので、
        ここでハンドラーを足さないと INFO が `logging.lastResort` に飲まれて消える。

        pytest はセッション中 root にハンドラーを付けるため、退避しないとこの分岐に到達できない
        （= 素朴に書くと「Lambda の分岐だけテストされ、ローカルの分岐は壊れても CI が緑」という
        非対称な状態になる）。
        """
        logging.getLogger().handlers, app_logger_state.handlers = [], []

        configure_logging("INFO")
        assert len(app_logger_state.handlers) == 1

        configure_logging("INFO")  # 冪等: 2回目で増えない
        assert len(app_logger_state.handlers) == 1

    def test_does_not_add_a_handler_when_root_already_has_one(
        self, app_logger_state: logging.Logger
    ) -> None:
        """Lambda の python ランタイムは root にハンドラーを付ける。ここで足すと二重に出る。"""
        logging.getLogger().addHandler(logging.NullHandler())
        app_logger_state.handlers = []

        configure_logging("INFO")

        assert app_logger_state.handlers == []

    def test_does_not_touch_the_formatter_of_root_handlers(
        self, app_logger_state: logging.Logger
    ) -> None:
        handler = logging.NullHandler()
        original = logging.Formatter("%(message)s")
        handler.setFormatter(original)
        logging.getLogger().addHandler(handler)

        configure_logging("INFO", log_format="json")

        assert handler.formatter is original

    def test_second_call_swaps_the_formatter_without_adding_handlers(
        self, app_logger_state: logging.Logger
    ) -> None:
        logging.getLogger().handlers, app_logger_state.handlers = [], []

        configure_logging("INFO", log_format="json")
        (handler,) = app_logger_state.handlers
        assert isinstance(handler.formatter, JsonLogFormatter)

        configure_logging("INFO", log_format="console")
        assert app_logger_state.handlers == [handler]
        assert isinstance(handler.formatter, ConsoleLogFormatter)

    def test_tracing_unavailable_warning_goes_through_the_configured_handler(
        self,
        app_logger_state: logging.Logger,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        """ローカルの経路で OTel を import できないときの警告も、`lastResort` のプレーンテキスト
        ではなく、足したハンドラー（JSON）で出る（trace lookup はハンドラーの確定後に作る）。"""
        logging.getLogger().handlers, app_logger_state.handlers = [], []
        monkeypatch.setitem(sys.modules, "opentelemetry", None)  # import を ImportError にする

        configure_logging("INFO", log_format="json", tracing_enabled=True)

        (line,) = [ln for ln in capsys.readouterr().err.splitlines() if "TRACING_ENABLED" in ln]
        payload = json.loads(line)
        assert payload["level"] == "WARNING"
        assert logs._LOG_OPTIONS.trace_lookup is None

    def test_updates_the_options_read_by_the_formatters(self) -> None:
        configure_logging("INFO", include_exception_messages=True)
        assert logs._LOG_OPTIONS.include_exception_messages is True

        configure_logging("INFO")
        assert logs._LOG_OPTIONS.include_exception_messages is False
        assert logs._LOG_OPTIONS.trace_lookup is None

    def test_tracing_disabled_does_not_import_opentelemetry(self) -> None:
        """無効時は OTel を import しない契約（ADR-013 決定7 の SS-178 追補）。"""
        import subprocess
        import sys

        code = (
            "import sys\n"
            "from sanposcape.core.observability import configure_logging\n"
            "configure_logging('INFO', tracing_enabled=False)\n"
            "assert not [m for m in sys.modules if m.startswith('opentelemetry')], 'imported'\n"
        )
        result = subprocess.run(
            [sys.executable, "-c", code], capture_output=True, text=True, check=False
        )

        assert result.returncode == 0, result.stderr

    def test_tracing_enabled_builds_a_lookup_that_returns_none_without_a_span(self) -> None:
        configure_logging("INFO", tracing_enabled=True)

        lookup = logs._LOG_OPTIONS.trace_lookup
        assert lookup is not None
        assert lookup() is None
