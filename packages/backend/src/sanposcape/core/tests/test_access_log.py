import asyncio
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

        monkeypatch.setattr(access_log, "record_exception_on_current_span", _fail)
        monkeypatch.setattr(tracing, "_WARNED", set())

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

        assert logs._log_context.get() is None
