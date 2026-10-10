import asyncio
import json
import logging
from collections.abc import Generator
from typing import Any

import pytest
from sqlalchemy.exc import IntegrityError
from starlette.types import Message

from sanposcape.core import observability
from sanposcape.core.observability import (
    AccessLogMiddleware,
    ConsoleLogFormatter,
    JsonLogFormatter,
    LogContext,
    UnhandledErrorAfterResponseStart,
    bind_log_user_id,
    configure_logging,
    log_context,
)


def _run_middleware(
    path: str,
    *,
    method: str = "GET",
    status: int = 200,
    raises: bool = False,
    raises_after_start: bool = False,
    exclude_paths: tuple[str, ...] = ("/health",),
    tracing_enabled: bool = False,
) -> list[Message]:
    sent: list[Message] = []

    async def inner_app(scope, receive, send) -> None:
        if raises:
            raise RuntimeError("boom")
        await send({"type": "http.response.start", "status": status, "headers": []})
        if raises_after_start:
            raise RuntimeError("boom after start")
        await send({"type": "http.response.body", "body": b"ok"})

    async def receive() -> dict:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: Message) -> None:
        sent.append(message)

    scope = {"type": "http", "path": path, "method": method, "headers": []}
    middleware = AccessLogMiddleware(
        inner_app, exclude_paths=exclude_paths, tracing_enabled=tracing_enabled
    )
    asyncio.run(middleware(scope, receive, send))
    return sent


class TestAccessLogMiddleware:
    def test_logs_one_line_with_method_path_and_status(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.INFO, logger="sanposcape.core.observability"):
            _run_middleware("/pin-photo-uploads", method="POST", status=201)

        assert len(caplog.records) == 1
        assert "POST /pin-photo-uploads -> 201" in caplog.records[0].getMessage()
        assert caplog.records[0].levelno == logging.INFO

    def test_logs_error_status_as_sent(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.INFO, logger="sanposcape.core.observability"):
            _run_middleware("/pin-photo-uploads", method="POST", status=401)

        assert "-> 401" in caplog.records[0].getMessage()
        assert caplog.records[0].levelno == logging.INFO

    def test_record_carries_the_access_log_extras(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.INFO, logger="sanposcape.core.observability"):
            _run_middleware("/walks", status=200)

        record = caplog.records[0]
        assert record.log_type == "access"
        assert record.http_status_code == 200
        assert record.duration_ms >= 0

    def test_unhandled_exception_is_logged_once_as_error_and_answered_with_500(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """未処理例外はここで握って 500 を返す（再送出しない。Mangum / uvicorn の二重ログと、
        OTel の ExceptionHandlerMiddleware によるスパンへのメッセージ記録を避ける）。"""
        with caplog.at_level(logging.INFO, logger="sanposcape.core.observability"):
            sent = _run_middleware("/pins", method="POST", raises=True)

        assert len(caplog.records) == 1
        record = caplog.records[0]
        assert record.levelno == logging.ERROR
        assert "POST /pins -> 500" in record.getMessage()
        assert record.exc_info is not None
        assert record.http_status_code == 500
        assert [m["status"] for m in sent if m["type"] == "http.response.start"] == [500]
        assert b"".join(m.get("body", b"") for m in sent) == b"Internal Server Error"

    def test_handler_converted_5xx_is_a_warning_without_exception(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """例外ハンドラーで変換した 503 などは WARNING（発生元が既に ERROR を出している場合が
        あり、二重の ERROR にしない）。"""
        with caplog.at_level(logging.INFO, logger="sanposcape.core.observability"):
            _run_middleware("/explore", status=503)

        assert caplog.records[0].levelno == logging.WARNING
        assert caplog.records[0].exc_info is None

    def test_exception_on_excluded_path_is_still_logged_as_error(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.INFO, logger="sanposcape.core.observability"):
            sent = _run_middleware("/health", raises=True)

        assert [r.levelno for r in caplog.records] == [logging.ERROR]
        assert sent[0]["status"] == 500

    def test_exception_after_the_response_started_is_logged_and_signalled_without_message(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        with (
            caplog.at_level(logging.INFO, logger="sanposcape.core.observability"),
            pytest.raises(UnhandledErrorAfterResponseStart) as raised,
        ):
            _run_middleware("/pins", raises_after_start=True)

        assert [r.levelno for r in caplog.records] == [logging.ERROR]
        assert str(raised.value) == ""
        assert raised.value.__cause__ is None
        assert raised.value.__suppress_context__ is True
        # 元の例外（メッセージを持つ）が `__context__` 経由で描かれる抜け道も塞ぐ
        assert raised.value.__context__ is None

    def test_a_failing_span_record_does_not_prevent_the_500_response(
        self, caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def _fail(exc: BaseException, *, enabled: bool) -> None:
            raise RuntimeError("otel is broken")

        monkeypatch.setattr(observability, "record_exception_on_current_span", _fail)
        monkeypatch.setattr(observability, "_WARNED", set())

        with caplog.at_level(logging.INFO, logger="sanposcape.core.observability"):
            sent = _run_middleware("/pins", raises=True, tracing_enabled=True)

        assert [m["status"] for m in sent if m["type"] == "http.response.start"] == [500]
        levels = [r.levelno for r in caplog.records]
        assert levels == [logging.ERROR, logging.WARNING]  # 元の ERROR 1 件 + 記録失敗の警告

    def test_cancelled_error_passes_through_without_a_log(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        async def inner_app(scope, receive, send) -> None:
            raise asyncio.CancelledError

        async def noop(*args: object, **kwargs: object) -> None:
            return None

        scope = {"type": "http", "path": "/pins", "method": "GET", "headers": []}
        with (
            caplog.at_level(logging.INFO, logger="sanposcape.core.observability"),
            pytest.raises(asyncio.CancelledError),
        ):
            asyncio.run(AccessLogMiddleware(inner_app)(scope, noop, noop))

        assert caplog.records == []

    def test_excluded_path_is_not_logged(self, caplog: pytest.LogCaptureFixture) -> None:
        """compose のヘルスチェックが5秒ごとに叩くため、既定で /health を除く。"""
        with caplog.at_level(logging.INFO, logger="sanposcape.core.observability"):
            _run_middleware("/health")

        assert caplog.records == []

    def test_query_string_is_not_logged(self, caplog: pytest.LogCaptureFixture) -> None:
        """クエリ文字列は出さない（将来トークン等が載ったときに黙って漏れる経路を作らない）。"""
        with caplog.at_level(logging.INFO, logger="sanposcape.core.observability"):
            _run_middleware("/walks")

        assert "?" not in caplog.records[0].getMessage()

    def test_non_http_scope_passes_through(self) -> None:
        received: list[str] = []

        async def inner_app(scope, receive, send) -> None:
            received.append(scope["type"])

        async def noop(*args: object, **kwargs: object) -> None:
            return None

        asyncio.run(AccessLogMiddleware(inner_app)({"type": "lifespan"}, noop, noop))

        assert received == ["lifespan"]

    def test_logs_inside_the_app_carry_the_http_method_and_the_routed_template(
        self, json_logs: list[dict[str, Any]]
    ) -> None:
        class _Route:
            path = "/pins/{pin_id}"

        async def inner_app(scope, receive, send) -> None:
            scope["route"] = _Route()  # Router が scope を書き換える挙動の再現
            logging.getLogger("sanposcape.probe").info("inside")
            await send({"type": "http.response.start", "status": 200, "headers": []})

        async def noop(*args: object, **kwargs: object) -> None:
            return None

        scope = {"type": "http", "path": "/pins/abc", "method": "DELETE", "headers": []}
        asyncio.run(AccessLogMiddleware(inner_app)(scope, noop, noop))

        inside, access = json_logs
        assert inside["http_method"] == "DELETE"
        assert inside["http_route"] == "/pins/{pin_id}"
        assert access["http_route"] == "/pins/{pin_id}"
        # 生のパスは message にだけ入り、http_route はテンプレート
        assert "abc" in access["message"] and "abc" not in access["http_route"]

    def test_route_is_omitted_when_the_request_did_not_match_a_route(
        self, json_logs: list[dict[str, Any]]
    ) -> None:
        _run_middleware("/nope", status=404)

        (access,) = json_logs
        assert "http_route" not in access
        assert access["http_method"] == "GET"

    def test_context_does_not_leak_after_the_request(self) -> None:
        _run_middleware("/walks")

        assert observability._log_context.get() is None


@pytest.fixture
def json_formatter() -> JsonLogFormatter:
    # 周囲の設定（`.env` が ENV=local なら ambient な `main.app` は例外メッセージを出す設定）に
    # 依存しないよう、安全側の既定へ揃える（teardown は conftest の `_restore_log_options`）。
    observability._LOG_OPTIONS.include_exception_messages = False
    observability._LOG_OPTIONS.trace_lookup = None
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
        monkeypatch.setattr(observability, "_MAX_MESSAGE_CHARS", 5)

        payload = json.loads(json_formatter.format(_record("abcdefghij")))

        assert payload["message"] == "abcde"
        assert payload["message_truncated"] is True

    def test_short_message_is_not_flagged(self, json_formatter: JsonLogFormatter) -> None:
        assert "message_truncated" not in json.loads(json_formatter.format(_record("hello")))

    def test_oversized_line_drops_the_stacktrace_but_keeps_the_rest(
        self, json_formatter: JsonLogFormatter, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(observability, "_MAX_LOG_LINE_BYTES", 300)
        monkeypatch.setattr(observability, "_MAX_MESSAGE_CHARS", 10_000)

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
            bind_log_user_id("u-1")
            payload = json.loads(json_formatter.format(_record()))

        assert payload["aws_request_id"] == "req-1"
        assert payload["http_method"] == "GET"
        assert payload["user_id"] == "u-1"
        assert "http_route" not in payload

    def test_trace_fields_come_from_the_lookup_when_tracing_is_enabled(
        self, json_formatter: JsonLogFormatter
    ) -> None:
        observability._LOG_OPTIONS.trace_lookup = lambda: ("a" * 32, "b" * 16, True)

        payload = json.loads(json_formatter.format(_record()))

        assert payload["trace_id"] == "a" * 32
        assert payload["span_id"] == "b" * 16
        assert payload["trace_sampled"] is True

    def test_no_trace_fields_without_a_valid_span(self, json_formatter: JsonLogFormatter) -> None:
        observability._LOG_OPTIONS.trace_lookup = lambda: None

        assert "trace_id" not in json.loads(json_formatter.format(_record()))

    def test_a_failing_trace_lookup_does_not_break_the_log(
        self, json_formatter: JsonLogFormatter
    ) -> None:
        def broken() -> tuple[str, str, bool]:
            raise RuntimeError

        observability._LOG_OPTIONS.trace_lookup = broken

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
        assert any("test_observability.py" in row for row in payload["exception_stacktrace"])
        assert "exception_message" not in payload
        assert "secret-xyz" not in line  # どの値にも現れない

    def test_message_is_emitted_when_enabled(self, json_formatter: JsonLogFormatter) -> None:
        observability._LOG_OPTIONS.include_exception_messages = True
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
        monkeypatch.setattr(observability, "_MAX_STACKTRACE_LINES", 3)

        payload = json.loads(json_formatter.format(_record(exc=_raise(RuntimeError()))))

        assert len(payload["exception_stacktrace"]) == 3
        assert payload["exception_stacktrace_truncated"] is True

    def test_truncation_keeps_the_tail_with_the_final_exception_type(
        self, json_formatter: JsonLogFormatter, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """送出箇所と最終例外の型名は末尾にある。切るなら先頭側（外側のフレーム）を省く。"""
        monkeypatch.setattr(observability, "_MAX_STACKTRACE_LINES", 3)

        payload = json.loads(json_formatter.format(_record(exc=_raise(KeyError("k")))))

        rows = payload["exception_stacktrace"]
        assert len(rows) == 3
        assert rows[0].startswith("... (") and "omitted" in rows[0]
        assert rows[-1] == "KeyError"
        assert payload["exception_stacktrace_truncated"] is True

    def test_exception_chain_cap_drops_the_oldest_causes(
        self, json_formatter: JsonLogFormatter, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(observability, "_MAX_EXCEPTION_CHAIN", 2)
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
            assert observability._log_context.get() is outer
            assert outer.aws_request_id == "req-1" and outer.http_method == "GET"
        assert observability._log_context.get() is None

    def test_none_values_do_not_overwrite(self) -> None:
        with log_context(aws_request_id="req-1") as ctx:
            with log_context(aws_request_id=None):
                pass
            assert ctx.aws_request_id == "req-1"

    def test_bind_user_id_without_a_context_is_a_noop(self) -> None:
        bind_log_user_id("u-1")  # 例外にならない

        assert observability._log_context.get() is None

    def test_user_id_bound_in_a_copied_context_reaches_the_caller(self) -> None:
        """同期の依存はスレッドプール（context のコピー）で動く。可変オブジェクトなので届く。"""
        import contextvars

        with log_context() as ctx:
            contextvars.copy_context().run(bind_log_user_id, "u-2")

        assert isinstance(ctx, LogContext) and ctx.user_id == "u-2"


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

    def test_updates_the_options_read_by_the_formatters(self) -> None:
        configure_logging("INFO", include_exception_messages=True)
        assert observability._LOG_OPTIONS.include_exception_messages is True

        configure_logging("INFO")
        assert observability._LOG_OPTIONS.include_exception_messages is False
        assert observability._LOG_OPTIONS.trace_lookup is None

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

        lookup = observability._LOG_OPTIONS.trace_lookup
        assert lookup is not None
        assert lookup() is None
