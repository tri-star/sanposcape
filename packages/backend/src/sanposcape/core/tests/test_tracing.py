"""トレース計装（ADR-013 / SS-178）のテスト。

テストは自前の `TracerProvider` + `InMemorySpanExporter` を作り、`tracer_provider=` で
計装に渡す。`trace.set_tracer_provider`（プロセスで 1 回しか設定できず、他のテストへ漏れる）は
使わない。グローバルな instrumentor（httpx / threading / sqlalchemy）は singleton なので、
各テストの前後で `uninstrument()` して状態を揃える（開発者の `.env` で
`TRACING_ENABLED=true` にしていても、ambient な `main.app` 経由で instrument 済みになる
場合があるため）。
"""

import logging
import os
import subprocess
import sys
import tempfile
from collections.abc import Generator
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpcore
import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from opentelemetry import trace
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.instrumentation.threading import ThreadingInstrumentor
from opentelemetry.instrumentation.urllib import URLLibInstrumentor
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from sqlalchemy import Engine, create_engine, event, insert, text
from sqlalchemy.exc import IntegrityError

from sanposcape.config import Settings
from sanposcape.conftest import test_engine
from sanposcape.core import observability
from sanposcape.core.observability import (
    _safe_error_description,
    instrument_fastapi_app,
    instrument_sqlalchemy_engine,
    record_exception_on_current_span,
    resolve_route_template,
)
from sanposcape.main import create_app
from sanposcape.users.models import User

pytestmark = pytest.mark.usefixtures("clean_instrumentors")


def _new_test_engine() -> Engine:
    """共有の `test_engine` と同じ接続先で、計装を試すための専用の engine を作る。

    接続先は `test_engine.url`（conftest が collection 時に `.env` / OS 環境変数から解決した値）
    を使う。テスト内で `Settings()` から組み立てると、`_isolate_settings_from_ambient_env` が
    環境変数を消した後なので既定値（host=db）になり、CI（DB_HOST=localhost）で繋がらない。
    """
    return create_engine(test_engine.url, **Settings().sqlalchemy_engine_kwargs)


def _tracing_on() -> Settings:
    # テスト実行時に組み立てる（import 時に Settings を作らない）。
    return Settings(env="test", tracing_enabled=True)


def _traced_app(provider: TracerProvider) -> FastAPI:
    """計装は `create_app()` ではなく、テスト用 provider を渡して明示的に行う。"""
    app = create_app(Settings(env="test"))

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("boom")

    instrument_fastapi_app(app, _tracing_on(), tracer_provider=provider)
    return app


def _observability_records(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    # `Settings()` は別ロガー（sanposcape.config）で JWT 秘密鍵未設定の警告を出すため除く。
    return [r for r in caplog.records if r.name == "sanposcape.core.observability"]


def _all_attribute_values(spans: tuple[ReadableSpan, ...]) -> list[str]:
    return [str(v) for span in spans for v in (span.attributes or {}).values()]


class TestDisabled:
    def test_default_settings_do_not_instrument(self) -> None:
        app = create_app(Settings(env="test"))

        assert not getattr(app, "_is_instrumented_by_opentelemetry", False)
        assert not HTTPXClientInstrumentor().is_instrumented_by_opentelemetry
        assert not ThreadingInstrumentor().is_instrumented_by_opentelemetry

    def test_does_not_import_opentelemetry_when_disabled(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        # 無効なら import を試みない（import が壊れていても警告すら出ない）。
        monkeypatch.setitem(sys.modules, "opentelemetry.instrumentation.fastapi", None)
        monkeypatch.setitem(sys.modules, "opentelemetry.instrumentation.sqlalchemy", None)

        with caplog.at_level(logging.WARNING):
            app = create_app(Settings(env="test"))
            instrument_sqlalchemy_engine(test_engine, Settings(env="test"))

        assert app is not None
        assert _observability_records(caplog) == []


class TestOpenTelemetryUnavailable:
    def test_create_app_survives_and_warns_once(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        monkeypatch.setitem(sys.modules, "opentelemetry.instrumentation.fastapi", None)

        with caplog.at_level(logging.WARNING, logger="sanposcape.core.observability"):
            app = create_app(_tracing_on())

        warnings = [
            r for r in _observability_records(caplog) if "import できない" in r.getMessage()
        ]
        assert len(warnings) == 1
        assert TestClient(app).get("/health").status_code == 200

    def test_sqlalchemy_is_noop_and_warns(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        monkeypatch.setitem(sys.modules, "opentelemetry.instrumentation.sqlalchemy", None)

        with caplog.at_level(logging.WARNING, logger="sanposcape.core.observability"):
            instrument_sqlalchemy_engine(test_engine, _tracing_on())

        assert len(_observability_records(caplog)) == 1

    def test_record_exception_is_noop_without_opentelemetry(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setitem(sys.modules, "opentelemetry", None)

        record_exception_on_current_span(RuntimeError("x"), enabled=True)  # 例外にならない


class TestUnconfiguredProvider:
    def test_warns_when_no_tracer_provider_is_configured(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        app = create_app(Settings(env="test"))

        with caplog.at_level(logging.WARNING, logger="sanposcape.core.observability"):
            instrument_fastapi_app(app, _tracing_on())  # tracer_provider を渡さない

        assert any("TracerProvider" in r.getMessage() for r in caplog.records)

    def test_does_not_warn_when_provider_is_given(
        self, provider: TracerProvider, caplog: pytest.LogCaptureFixture
    ) -> None:
        app = create_app(Settings(env="test"))

        with caplog.at_level(logging.WARNING, logger="sanposcape.core.observability"):
            instrument_fastapi_app(app, _tracing_on(), tracer_provider=provider)

        assert _observability_records(caplog) == []


class TestFastApiSpans:
    def test_span_name_and_http_route_use_route_template(
        self, provider: TracerProvider, exporter: InMemorySpanExporter
    ) -> None:
        client = TestClient(_traced_app(provider))

        client.get("/pins/0b5b3c3e-0000-4000-8000-000000000000")

        (span,) = exporter.get_finished_spans()
        assert span.name == "GET /pins/{pin_id}"
        assert span.attributes["http.route"] == "/pins/{pin_id}"

    def test_query_string_never_appears_in_any_attribute(
        self, provider: TracerProvider, exporter: InMemorySpanExporter
    ) -> None:
        client = TestClient(_traced_app(provider))

        client.get("/pins?secret=abc&lat=35.1&lng=139.7")
        client.get("/pins/0b5b3c3e-0000-4000-8000-000000000000?secret=abc&lat=35.1")

        spans = exporter.get_finished_spans()
        assert spans
        values = _all_attribute_values(spans)
        for forbidden in ("secret=abc", "35.1", "139.7", "?"):
            assert not [v for v in values if forbidden in v], forbidden
        for span in spans:
            assert (
                span.attributes["http.url"] == f"http://testserver{span.attributes['http.target']}"
            )
            assert "?" not in span.attributes["http.target"]

    def test_unmatched_route_does_not_put_raw_path_in_span_name(
        self, provider: TracerProvider, exporter: InMemorySpanExporter
    ) -> None:
        client = TestClient(_traced_app(provider))

        response = client.get("/no-such-path/0b5b3c3e")

        assert response.status_code == 404
        (span,) = exporter.get_finished_spans()
        assert span.name == "GET"
        assert "http.route" not in span.attributes

    def test_health_is_excluded(
        self, provider: TracerProvider, exporter: InMemorySpanExporter
    ) -> None:
        client = TestClient(_traced_app(provider))

        assert client.get("/health").status_code == 200

        assert exporter.get_finished_spans() == ()

    def test_no_receive_send_internal_spans(
        self, provider: TracerProvider, exporter: InMemorySpanExporter
    ) -> None:
        client = TestClient(_traced_app(provider))

        client.get("/pins/0b5b3c3e-0000-4000-8000-000000000000")

        assert len(exporter.get_finished_spans()) == 1

    def test_unhandled_exception_marks_span_error_with_exception_event(
        self, provider: TracerProvider, exporter: InMemorySpanExporter
    ) -> None:
        client = TestClient(_traced_app(provider), raise_server_exceptions=False)

        assert client.get("/boom").status_code == 500

        (span,) = exporter.get_finished_spans()
        assert span.status.status_code == trace.StatusCode.ERROR
        assert [e.name for e in span.events] == ["exception"]

    def test_unhandled_exception_event_currently_carries_message_r7(
        self, provider: TracerProvider, exporter: InMemorySpanExporter
    ) -> None:
        """R7（残るリスク）: 未処理の 500 で ASGI 計装が自動で付ける exception イベントには
        message が載る（DB 例外なら DETAIL のキー値など）。今回は塞がず、現状の挙動を固定する。
        SS-180 でログ（Mangum のトレースバック）と合わせて対処する（ADR-013 決定6 の追補）。
        塞いだらこのテストを「載らない」に反転すること。
        """
        client = TestClient(_traced_app(provider), raise_server_exceptions=False)

        client.get("/boom")

        (span,) = exporter.get_finished_spans()
        (event,) = span.events
        assert event.attributes["exception.message"] == "boom"

    def test_peer_ip_port_and_user_agent_are_blanked(
        self, provider: TracerProvider, exporter: InMemorySpanExporter
    ) -> None:
        client = TestClient(_traced_app(provider), headers={"User-Agent": "secret-agent/1.0"})

        client.get("/pins/0b5b3c3e-0000-4000-8000-000000000000")

        (span,) = exporter.get_finished_spans()
        for key in ("net.peer.ip", "net.peer.port", "http.user_agent"):
            assert span.attributes[key] == ""
        assert not [v for v in _all_attribute_values((span,)) if "secret-agent" in v]

    def test_instrumenting_twice_is_idempotent(
        self, provider: TracerProvider, exporter: InMemorySpanExporter
    ) -> None:
        app = _traced_app(provider)
        instrument_fastapi_app(app, _tracing_on(), tracer_provider=provider)
        client = TestClient(app)

        client.get("/pins/0b5b3c3e-0000-4000-8000-000000000000")

        assert len(exporter.get_finished_spans()) == 1


class TestRecordExceptionOnCurrentSpan:
    def test_records_exception_and_error_status(
        self, provider: TracerProvider, exporter: InMemorySpanExporter
    ) -> None:
        tracer = provider.get_tracer("test")

        with tracer.start_as_current_span("op"):
            record_exception_on_current_span(RuntimeError("fixed message"), enabled=True)

        (span,) = exporter.get_finished_spans()
        assert span.status.status_code == trace.StatusCode.ERROR
        assert span.status.description == "RuntimeError"
        (event,) = span.events
        assert event.name == "exception"
        # 型名だけ。メッセージ・スタックトレース（__cause__ の連鎖）は載せない（決定6）。
        assert dict(event.attributes) == {"exception.type": "RuntimeError"}

    def test_does_not_record_message_or_cause(
        self, provider: TracerProvider, exporter: InMemorySpanExporter
    ) -> None:
        tracer = provider.get_tracer("test")
        try:
            try:
                raise ValueError("https://example.test/path?token=SECRET")
            except ValueError as cause:
                raise RuntimeError("wrapped") from cause
        except RuntimeError as exc:
            with tracer.start_as_current_span("op"):
                record_exception_on_current_span(exc, enabled=True)

        (span,) = exporter.get_finished_spans()
        assert "SECRET" not in repr(
            [(e.name, dict(e.attributes)) for e in span.events] + [span.status.description]
        )

    def test_noop_without_recording_span(self) -> None:
        record_exception_on_current_span(RuntimeError("x"), enabled=True)  # 例外にならない


class TestDisabledDoesNotImportOpenTelemetry:
    def test_503_handler_does_not_import_opentelemetry_when_tracing_is_disabled(self) -> None:
        """無効（既定）では、503 のハンドラーが走っても opentelemetry を import しない。

        pytest のプロセスは既に import 済みなので、別プロセスで確かめる。
        """
        code = (
            "import sys\n"
            "from fastapi.testclient import TestClient\n"
            "from sanposcape.config import Settings\n"
            "from sanposcape.main import create_app\n"
            "from sanposcape.maps.exceptions import MapsUnavailableError\n"
            "app = create_app(Settings(env='test'))\n"
            "@app.get('/maps-down')\n"
            "def maps_down():\n"
            "    raise MapsUnavailableError()\n"
            "r = TestClient(app).get('/maps-down')\n"
            "assert r.status_code == 503, r.status_code\n"
            "loaded = sorted(m for m in sys.modules if m.split('.')[0] == 'opentelemetry')\n"
            "assert not loaded, loaded\n"
        )
        env = {k: v for k, v in os.environ.items() if k != "TRACING_ENABLED"}
        env["PYTHONPATH"] = str(Path(__file__).resolve().parents[3])

        result = subprocess.run(
            [sys.executable, "-c", code],
            env=env,
            cwd=tempfile.gettempdir(),
            capture_output=True,
            text=True,
            check=False,
        )

        assert result.returncode == 0, result.stderr

    def test_record_exception_is_noop_when_disabled(
        self, provider: TracerProvider, exporter: InMemorySpanExporter
    ) -> None:
        with provider.get_tracer("t").start_as_current_span("op"):
            record_exception_on_current_span(RuntimeError("x"), enabled=False)

        (span,) = exporter.get_finished_spans()
        assert span.events == ()


class TestUrllib:
    def test_query_and_fragment_are_removed_from_http_url(
        self,
        provider: TracerProvider,
        exporter: InMemorySpanExporter,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import urllib.request

        instrument_fastapi_app(
            create_app(Settings(env="test")), _tracing_on(), tracer_provider=provider
        )
        assert URLLibInstrumentor().is_instrumented_by_opentelemetry

        monkeypatch.setattr(
            "http.client.HTTPConnection.request", lambda *a, **k: (_ for _ in ()).throw(OSError)
        )
        # 実際の接続は行わない（OSError で失敗してよい。スパンの属性だけを見る）。
        with pytest.raises(OSError):
            urllib.request.urlopen(  # noqa: S310
                "http://jwks.example.test/certs?key=SECRET&lat=35.1#frag", timeout=1
            )

        spans = [s for s in exporter.get_finished_spans() if s.name == "GET"]
        assert len(spans) == 1
        assert spans[0].attributes["http.url"] == "http://jwks.example.test/certs"
        assert not [v for v in _all_attribute_values(tuple(spans)) if "SECRET" in v or "35.1" in v]

    def test_hook_failure_blanks_http_url(
        self,
        provider: TracerProvider,
        exporter: InMemorySpanExporter,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(observability, "_WARNED", set())
        with provider.get_tracer("t").start_as_current_span(
            "s", attributes={"http.url": "http://h/p?key=SECRET"}
        ) as span:
            observability._scrub_query_from_urllib_span(span, object())  # full_url が無い

        (finished,) = exporter.get_finished_spans()
        assert finished.attributes["http.url"] == ""


class TestThreadingAndHttpx:
    def test_span_created_in_worker_thread_is_child_of_caller(
        self, provider: TracerProvider, exporter: InMemorySpanExporter
    ) -> None:
        instrument_fastapi_app(
            create_app(Settings(env="test")), _tracing_on(), tracer_provider=provider
        )
        tracer = provider.get_tracer("test")

        def work() -> None:
            with tracer.start_as_current_span("child"):
                pass

        with (
            tracer.start_as_current_span("parent") as parent,
            ThreadPoolExecutor(max_workers=2) as executor,
        ):
            for future in [executor.submit(work) for _ in range(2)]:
                future.result()

        children = [s for s in exporter.get_finished_spans() if s.name == "child"]
        assert len(children) == 2
        assert {s.parent.span_id for s in children} == {parent.get_span_context().span_id}
        assert {s.context.trace_id for s in children} == {parent.get_span_context().trace_id}

    def test_httpx_span_in_worker_thread_joins_the_trace_and_drops_query(
        self,
        provider: TracerProvider,
        exporter: InMemorySpanExporter,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        instrument_fastapi_app(
            create_app(Settings(env="test")), _tracing_on(), tracer_provider=provider
        )
        tracer = provider.get_tracer("test")
        # httpx の計装は `HTTPTransport.handle_request` をクラス単位で包むため、MockTransport
        # ではスパンが出ない。実 Transport を使い、その下の httpcore の接続プールだけ差し替える。
        client = httpx.Client(trust_env=False)
        monkeypatch.setattr(
            client._transport._pool,
            "handle_request",
            lambda request: httpcore.Response(200, content=b"{}"),
        )

        url = "https://routes.example.test/v2:compute?key=SECRET&lat=35.1"
        with (
            tracer.start_as_current_span("parent") as parent,
            ThreadPoolExecutor(max_workers=1) as executor,
        ):
            executor.submit(client.get, url).result()

        http_spans = [s for s in exporter.get_finished_spans() if s.name != "parent"]
        assert len(http_spans) == 1
        (http_span,) = http_spans
        assert http_span.parent.span_id == parent.get_span_context().span_id
        assert http_span.attributes["http.url"] == "https://routes.example.test/v2:compute"
        values = _all_attribute_values((http_span,))
        assert not [v for v in values if "SECRET" in v or "35.1" in v]


class TestPartialInstrumentation:
    """R1: 計装は個別に守る。1 つ欠けても失敗しても、他は続行し起動を落とさない。"""

    def test_missing_httpx_still_instruments_fastapi(
        self,
        provider: TracerProvider,
        monkeypatch: pytest.MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        monkeypatch.setitem(sys.modules, "opentelemetry.instrumentation.httpx", None)
        app = create_app(Settings(env="test"))

        with caplog.at_level(logging.WARNING, logger="sanposcape.core.observability"):
            instrument_fastapi_app(app, _tracing_on(), tracer_provider=provider)

        assert app._is_instrumented_by_opentelemetry is True
        assert ThreadingInstrumentor().is_instrumented_by_opentelemetry
        assert len(_observability_records(caplog)) == 1

    def test_failing_threading_instrumentation_does_not_raise_and_others_continue(
        self,
        provider: TracerProvider,
        monkeypatch: pytest.MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        def boom(self: object, **kwargs: object) -> None:
            raise RuntimeError("instrument failed")

        monkeypatch.setattr(ThreadingInstrumentor, "instrument", boom)
        app = create_app(Settings(env="test"))

        with caplog.at_level(logging.WARNING, logger="sanposcape.core.observability"):
            instrument_fastapi_app(app, _tracing_on(), tracer_provider=provider)

        assert app._is_instrumented_by_opentelemetry is True
        assert HTTPXClientInstrumentor().is_instrumented_by_opentelemetry
        assert any("threading" in r.getMessage() for r in _observability_records(caplog))

    def test_missing_fastapi_instrumentation_does_not_raise(
        self, provider: TracerProvider, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setitem(sys.modules, "opentelemetry.instrumentation.fastapi", None)
        app = create_app(Settings(env="test"))

        instrument_fastapi_app(app, _tracing_on(), tracer_provider=provider)

        assert HTTPXClientInstrumentor().is_instrumented_by_opentelemetry
        assert TestClient(app).get("/health").status_code == 200


class TestScrubHooksFailSafe:
    """R2: クエリ除去フックの失敗はフェイルオープンにしない（空を書き、警告は 1 回）。"""

    def test_server_hook_failure_blanks_http_url_and_warns_once(
        self,
        provider: TracerProvider,
        exporter: InMemorySpanExporter,
        monkeypatch: pytest.MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        monkeypatch.setattr(observability, "_WARNED", set())
        tracer = provider.get_tracer("t")

        with caplog.at_level(logging.WARNING, logger="sanposcape.core.observability"):
            for _ in range(2):
                with tracer.start_as_current_span(
                    "s", attributes={"http.url": "http://h/p?secret=abc"}
                ) as span:
                    observability._scrub_query_from_server_span(span, None)  # scope 不正

        assert [s.attributes["http.url"] for s in exporter.get_finished_spans()] == ["", ""]
        assert len(_observability_records(caplog)) == 1

    def test_client_hook_failure_blanks_http_url(
        self,
        provider: TracerProvider,
        exporter: InMemorySpanExporter,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(observability, "_WARNED", set())
        tracer = provider.get_tracer("t")

        with tracer.start_as_current_span(
            "s", attributes={"http.url": "http://h/p?key=SECRET"}
        ) as span:
            observability._scrub_query_from_client_span(span, object())  # url が無い

        (finished,) = exporter.get_finished_spans()
        assert finished.attributes["http.url"] == ""


class TestHandleErrorListenerIsSafe:
    """R3: リスナーの失敗で、アプリが受け取る SQLAlchemy の例外を置き換えない。"""

    def test_exception_in_listener_is_swallowed_and_span_still_ends(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(observability, "_WARNED", set())
        ended: list[bool] = []

        class FakeSpan:
            def is_recording(self) -> bool:
                return True

            def set_status(self, status: object) -> None:
                raise RuntimeError("listener bug")

            def end(self) -> None:
                ended.append(True)

        class FakeExecutionContext:
            _otel_span = FakeSpan()

        class FakeContext:
            execution_context = FakeExecutionContext()
            original_exception = RuntimeError("x")

        observability._handle_error_without_message(FakeContext())  # 例外にならない

        assert ended == [True]

    def test_missing_execution_context_is_swallowed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(observability, "_WARNED", set())

        observability._handle_error_without_message(object())  # 例外にならない


class TestSqlAlchemyPrivateApiContract:
    """計装の非公開名への依存（版上げで壊れたらここで落ちる）。"""

    def test_private_names_we_depend_on_exist(self) -> None:
        from opentelemetry.instrumentation.sqlalchemy import engine as otel_engine

        assert callable(otel_engine._handle_error)
        assert isinstance(otel_engine.EngineTracer._remove_event_listener_params, list)
        assert callable(otel_engine.EngineTracer.remove_all_event_listeners)

    def test_fail_closed_when_the_upstream_listener_cannot_be_removed(
        self,
        provider: TracerProvider,
        exporter: InMemorySpanExporter,
        monkeypatch: pytest.MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """外せなかったら、メッセージ入りの元リスナーを残さず計装を諦める（DB は動き続ける）。"""
        from sqlalchemy import event

        def failing_remove(*args: object, **kwargs: object) -> None:
            raise RuntimeError("cannot remove")

        monkeypatch.setattr(event, "remove", failing_remove)
        engine = _new_test_engine()
        subject = "subject-fail-closed-456"
        try:
            with caplog.at_level(logging.WARNING, logger="sanposcape.core.observability"):
                instrument_sqlalchemy_engine(engine, _tracing_on(), tracer_provider=provider)
            with engine.begin() as conn:
                conn.execute(insert(User), {"provider": "dev", "provider_subject": subject})
            with pytest.raises(IntegrityError), engine.begin() as conn:
                conn.execute(insert(User), {"provider": "dev", "provider_subject": subject})
        finally:
            engine.dispose()

        assert any("計装に失敗" in r.getMessage() for r in _observability_records(caplog))
        assert subject not in repr(
            [(s.status.description, s.attributes, s.events) for s in exporter.get_finished_spans()]
        )


class TestSqlAlchemy:
    @pytest.fixture(autouse=True)
    def _remove_own_listener(self) -> Generator[None, None, None]:
        """共有の `test_engine` に付けた自前リスナーを後始末する（`uninstrument()` は
        計装側のリスナーしか外さない）。"""
        yield
        if event.contains(test_engine, "handle_error", observability._handle_error_without_message):
            event.remove(test_engine, "handle_error", observability._handle_error_without_message)

    def test_db_span_is_child_of_request_span_and_has_no_bind_values(
        self, provider: TracerProvider, exporter: InMemorySpanExporter
    ) -> None:
        app = _traced_app(provider)

        @app.get("/db-probe")
        def db_probe() -> dict[str, str]:
            with test_engine.connect() as conn:
                conn.execute(text("SELECT :needle AS v"), {"needle": "bind-value-xyz"})
            return {"ok": "1"}

        instrument_sqlalchemy_engine(test_engine, _tracing_on(), tracer_provider=provider)

        assert TestClient(app).get("/db-probe").status_code == 200

        spans = exporter.get_finished_spans()
        server = next(s for s in spans if s.name == "GET /db-probe")
        db_spans = [s for s in spans if s.attributes.get("db.statement")]
        assert db_spans
        assert all(s.parent.span_id == server.context.span_id for s in db_spans)
        statements = [str(s.attributes["db.statement"]) for s in db_spans]
        assert any("SELECT" in st for st in statements)
        assert not [v for v in _all_attribute_values(spans) if "bind-value-xyz" in v]

    def test_without_skip_dep_check_sqlalchemy_21_is_not_instrumented(
        self, provider: TracerProvider, exporter: InMemorySpanExporter
    ) -> None:
        """`skip_dep_check=True` が必要な根拠（contrib#5118）。

        upstream が SQLAlchemy 2.1 に対応したらこのテストが落ちる。そのときは
        `instrument_sqlalchemy_engine` の `skip_dep_check` と TODO を外し、このテストを消す。
        """
        SQLAlchemyInstrumentor().instrument(engine=test_engine, tracer_provider=provider)

        with test_engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        assert exporter.get_finished_spans() == ()

    def test_hide_parameters_removes_parameters_from_integrity_error(self) -> None:
        engine = _new_test_engine()
        try:
            with engine.begin() as conn:
                conn.execute(
                    insert(User), {"provider": "dev", "provider_subject": "dup", "email": "a@b.c"}
                )
            with pytest.raises(IntegrityError) as exc_info, engine.begin() as conn:
                conn.execute(
                    insert(User),
                    {"provider": "dev", "provider_subject": "dup", "email": "a@b.c"},
                )
        finally:
            engine.dispose()

        assert "[parameters:" not in str(exc_info.value)

    def test_unique_violation_status_has_type_and_sqlstate_but_no_key_value(
        self, provider: TracerProvider, exporter: InMemorySpanExporter
    ) -> None:
        """D11 A 案: エラー status の説明に一意制約違反のキー値を載せない。

        計装の非公開名（`_handle_error`・`_otel_span`）に依存するため、opentelemetry の版を
        上げて壊れたらこのテストが落ちる。
        """
        engine = _new_test_engine()
        instrument_sqlalchemy_engine(engine, _tracing_on(), tracer_provider=provider)
        subject = "subject-key-value-123"
        try:
            with engine.begin() as conn:
                conn.execute(insert(User), {"provider": "dev", "provider_subject": subject})
            with pytest.raises(IntegrityError), engine.begin() as conn:
                conn.execute(insert(User), {"provider": "dev", "provider_subject": subject})
        finally:
            engine.dispose()

        spans = exporter.get_finished_spans()
        error_spans = [s for s in spans if s.status.status_code == trace.StatusCode.ERROR]
        assert len(error_spans) == 1
        assert error_spans[0].status.description == "UniqueViolation (SQLSTATE 23505)"
        assert not [v for v in _all_attribute_values(spans) if subject in v]
        assert subject not in repr([(s.status.description, s.events) for s in spans])
        # 失敗したスパンも終了している（リークしない）。
        assert all(s.end_time is not None for s in spans)

    def test_safe_error_description_without_sqlstate_is_type_name_only(self) -> None:
        assert _safe_error_description(RuntimeError("secret")) == "RuntimeError"
        assert _safe_error_description(None) == "Error"


class TestResolveRouteTemplate:
    def test_joins_prefixes_of_nested_routers(self) -> None:
        from fastapi import APIRouter

        inner = APIRouter(prefix="/inner")

        @inner.get("/{item_id}")
        def get_item(item_id: str) -> dict[str, str]:
            return {"id": item_id}

        middle = APIRouter(prefix="/middle")
        middle.include_router(inner)
        app = FastAPI()
        app.include_router(middle, prefix="/outer")
        captured: dict[str, str | None] = {}

        @app.middleware("http")
        async def capture(request, call_next):  # type: ignore[no-untyped-def]
            response = await call_next(request)
            captured["route"] = resolve_route_template(request.scope)
            return response

        TestClient(app).get("/outer/middle/inner/42")

        assert captured["route"] == "/outer/middle/inner/{item_id}"

    def test_returns_none_when_not_routed(self) -> None:
        assert resolve_route_template({"type": "http", "path": "/x"}) is None
