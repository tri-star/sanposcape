import asyncio
import logging

import pytest

from sanposcape.core.observability import AccessLogMiddleware, configure_logging


def _run_middleware(
    path: str,
    *,
    method: str = "GET",
    status: int = 200,
    raises: bool = False,
    exclude_paths: tuple[str, ...] = ("/health",),
) -> None:
    async def inner_app(scope, receive, send) -> None:
        if raises:
            raise RuntimeError("boom")
        await send({"type": "http.response.start", "status": status, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    async def receive() -> dict:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict) -> None:
        return None

    scope = {"type": "http", "path": path, "method": method, "headers": []}
    asyncio.run(AccessLogMiddleware(inner_app, exclude_paths=exclude_paths)(scope, receive, send))


class TestAccessLogMiddleware:
    def test_logs_one_line_with_method_path_and_status(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.INFO, logger="sanposcape.core.observability"):
            _run_middleware("/pin-photo-uploads", method="POST", status=201)

        assert len(caplog.records) == 1
        assert "POST /pin-photo-uploads -> 201" in caplog.records[0].getMessage()

    def test_logs_error_status_as_sent(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.INFO, logger="sanposcape.core.observability"):
            _run_middleware("/pin-photo-uploads", method="POST", status=401)

        assert "-> 401" in caplog.records[0].getMessage()

    def test_logs_and_reraises_when_the_app_raises(self, caplog: pytest.LogCaptureFixture) -> None:
        """応答が始まる前に落ちた場合も1行は残す（ServerErrorMiddleware が 500 にする経路）。"""
        with (
            caplog.at_level(logging.INFO, logger="sanposcape.core.observability"),
            pytest.raises(RuntimeError),
        ):
            _run_middleware("/pins", method="POST", raises=True)

        assert "POST /pins -> 500" in caplog.records[0].getMessage()

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


class TestConfigureLogging:
    def test_sets_the_level_of_the_app_logger(self) -> None:
        app_logger = logging.getLogger("sanposcape")
        original_level = app_logger.level
        try:
            configure_logging("WARNING")
            assert app_logger.level == logging.WARNING
            configure_logging("INFO")
            assert app_logger.level == logging.INFO
        finally:
            app_logger.setLevel(original_level)

    def test_does_not_add_a_handler_when_root_already_has_one(self) -> None:
        """Lambda の python ランタイムは root にハンドラーを付ける。ここで足すと二重に出る。"""
        app_logger = logging.getLogger("sanposcape")
        root = logging.getLogger()
        original_level = app_logger.level
        added = logging.NullHandler()
        root.addHandler(added)
        try:
            before = list(app_logger.handlers)
            configure_logging("INFO")
            assert app_logger.handlers == before
        finally:
            root.removeHandler(added)
            app_logger.setLevel(original_level)
