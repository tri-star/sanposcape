import asyncio
import json
import logging
from typing import Any

import pytest
from starlette.types import Message

from sanposcape.core import access_log, logs, tracing
from sanposcape.core.access_log import AccessLogMiddleware, UnhandledErrorAfterResponseStart


def _run_middleware(
    path: str,
    *,
    method: str = "GET",
    status: int = 200,
    raises: bool = False,
    raises_after_start: bool = False,
    exclude_paths: tuple[str, ...] = ("/health",),
    tracing_enabled: bool = False,
    headers: list[tuple[bytes, bytes]] | None = None,
    inner_log: str | None = None,
) -> list[Message]:
    sent: list[Message] = []

    async def inner_app(scope, receive, send) -> None:
        if inner_log is not None:
            logging.getLogger("sanposcape.test_inner").info(inner_log)
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

    scope = {"type": "http", "path": path, "method": method, "headers": headers or []}
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

        monkeypatch.setattr(access_log, "record_exception_on_current_span", _fail)
        monkeypatch.setattr(tracing, "_WARNED", set())

        with caplog.at_level(logging.INFO, logger="sanposcape.core.observability"):
            sent = _run_middleware("/pins", raises=True, tracing_enabled=True)

        assert [m["status"] for m in sent if m["type"] == "http.response.start"] == [500]
        levels = [r.levelno for r in caplog.records]
        assert levels == [logging.ERROR, logging.WARNING]  # 元の ERROR 1 件 + 記録失敗の警告

    def test_a_failing_span_annotation_does_not_change_the_response(
        self, caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def _fail(span: object, attributes: dict[str, str]) -> None:
            raise RuntimeError("otel is broken")

        monkeypatch.setattr(access_log, "capture_current_span", lambda *, enabled: object())
        monkeypatch.setattr(access_log, "annotate_span", _fail)
        monkeypatch.setattr(tracing, "_WARNED", set())

        with caplog.at_level(logging.INFO, logger="sanposcape.core.observability"):
            sent = _run_middleware("/pins", status=201, tracing_enabled=True)

        assert [m["status"] for m in sent if m["type"] == "http.response.start"] == [201]
        assert [r.levelno for r in caplog.records] == [logging.WARNING, logging.INFO]

    def test_a_failing_span_annotation_does_not_prevent_the_500_response(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def _fail(span: object, attributes: dict[str, str]) -> None:
            raise RuntimeError("otel is broken")

        monkeypatch.setattr(access_log, "capture_current_span", lambda *, enabled: object())
        monkeypatch.setattr(access_log, "annotate_span", _fail)
        monkeypatch.setattr(tracing, "_WARNED", set())

        sent = _run_middleware("/pins", raises=True, tracing_enabled=True)

        assert [m["status"] for m in sent if m["type"] == "http.response.start"] == [500]

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

        assert logs._log_context.get() is None


_SESSION_ID = "0b5b3c3e-1111-4222-8333-444455556666"
_SESSION_HEADER = b"x-app-session-id"


class TestAppSessionId:
    """`X-App-Session-Id`（クライアント由来の信頼できない入力）の受け口。"""

    def test_valid_value_is_in_the_access_log_and_in_app_logs(
        self, json_logs: list[dict[str, Any]]
    ) -> None:
        _run_middleware(
            "/pins",
            headers=[(_SESSION_HEADER, _SESSION_ID.encode())],
            inner_log="inside the app",
        )

        inner, access = json_logs
        assert inner["message"] == "inside the app"
        assert inner["app_session_id"] == _SESSION_ID
        assert access["app_session_id"] == _SESSION_ID

    def test_header_name_is_case_insensitive(self, json_logs: list[dict[str, Any]]) -> None:
        _run_middleware("/pins", headers=[(b"X-App-Session-Id", _SESSION_ID.encode())])

        (access,) = json_logs
        assert access["app_session_id"] == _SESSION_ID

    def test_is_attached_even_to_requests_rejected_before_routing(
        self, json_logs: list[dict[str, Any]]
    ) -> None:
        _run_middleware("/nope", status=404, headers=[(_SESSION_HEADER, _SESSION_ID.encode())])

        (access,) = json_logs
        assert access["http_status_code"] == 404
        assert access["app_session_id"] == _SESSION_ID

    def test_absent_header_means_no_field(self, json_logs: list[dict[str, Any]]) -> None:
        _run_middleware("/pins")

        (access,) = json_logs
        assert "app_session_id" not in access

    @pytest.mark.parametrize(
        ("label", "raw"),
        [
            ("uppercase", _SESSION_ID.upper().encode()),
            ("37 chars", (_SESSION_ID + "0").encode()),
            ("35 chars", _SESSION_ID[:-1].encode()),
            ("uuid v1", b"0b5b3c3e-1111-1222-8333-444455556666"),
            ("bad variant", b"0b5b3c3e-1111-4222-c333-444455556666"),
            ("no hyphens", _SESSION_ID.replace("-", "x").encode()),
            ("newline inside", b"0b5b3c3e-1111-4222-8333-4444555566\n6"),
            ("trailing newline", (_SESSION_ID[:-1] + "\n").encode()),
            ("non-ascii", ("0b5b3c3e-1111-4222-8333-44445555666" + "é").encode()),
            ("invalid utf-8", b"\xff" * 36),
            ("empty", b""),
            ("10KB", b"a" * 10_240),
            ("log injection", b'" \\n{"level":"CRITICAL"}' + b"0" * 20),
        ],
    )
    def test_invalid_value_is_dropped_everywhere_and_the_request_is_not_rejected(
        self, label: str, raw: bytes, json_logs: list[dict[str, Any]]
    ) -> None:
        sent = _run_middleware(
            "/pins", status=201, headers=[(_SESSION_HEADER, raw)], inner_log="inside the app"
        )

        assert [m["status"] for m in sent if m["type"] == "http.response.start"] == [201]
        assert json_logs
        assert all("app_session_id" not in line for line in json_logs), label
        # パース済みの値（JSON エスケープ前）と比べる。エスケープ後の文字列と比べると、
        # 改行・引用符を含む値は漏れていても一致せず、検査が常に通ってしまう。
        values = [str(value) for line in json_logs for value in line.values()]
        text = raw.decode("utf-8", errors="replace")
        if text:
            assert not any(text in value for value in values), label
        assert all(line["level"] != "CRITICAL" for line in json_logs), label

    def test_duplicate_headers_are_all_dropped(self, json_logs: list[dict[str, Any]]) -> None:
        other = "1b5b3c3e-1111-4222-8333-444455556666"

        _run_middleware(
            "/pins",
            headers=[(_SESSION_HEADER, _SESSION_ID.encode()), (_SESSION_HEADER, other.encode())],
        )

        (access,) = json_logs
        assert "app_session_id" not in access
        assert _SESSION_ID not in json.dumps(json_logs)
        assert other not in json.dumps(json_logs)

    def test_invalid_value_emits_no_warning(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.DEBUG, logger="sanposcape"):
            _run_middleware("/pins", headers=[(_SESSION_HEADER, b"x" * 10_240)])

        assert [r.levelno for r in caplog.records] == [logging.INFO]  # アクセスログだけ

    def test_context_does_not_leak_to_the_next_request(
        self, json_logs: list[dict[str, Any]]
    ) -> None:
        _run_middleware("/pins", headers=[(_SESSION_HEADER, _SESSION_ID.encode())])
        _run_middleware("/pins")

        first, second = json_logs
        assert first["app_session_id"] == _SESSION_ID
        assert "app_session_id" not in second
