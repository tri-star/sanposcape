"""`aws_lambda/tracing.py`（Lambda 計装の親スパンの補正。ADR-013 / SS-178）のテスト。

Lambda 計装のスパンは本物を使わず、テスト側で同じ形（SERVER、属性に `http.target` の
クエリ込みの値と、生のパスの `http.route`）のスパンを開いてから Mangum を呼ぶ。
"""

import asyncio
import copy
import json
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from mangum import Mangum
from opentelemetry import trace
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from sanposcape.aws_lambda.tracing import _LambdaRootSpanMiddleware, wrap_app_for_lambda_tracing
from sanposcape.config import Settings
from sanposcape.core.observability import instrument_fastapi_app
from sanposcape.main import create_app

_EVENTS_DIR = Path(__file__).resolve().parents[4] / "events"
_PIN_ID = "0b5b3c3e-0000-4000-8000-000000000000"

pytestmark = pytest.mark.usefixtures("clean_instrumentors")


def _app(provider: TracerProvider, *, enabled: bool = True) -> FastAPI:
    settings = Settings(env="test", tracing_enabled=enabled)
    app = create_app(Settings(env="test"))
    app.state.settings = settings
    instrument_fastapi_app(app, settings, tracer_provider=provider)
    return app


def _event(path: str, query: str = "") -> dict:
    event = json.loads((_EVENTS_DIR / "health-get.json").read_text())
    event = copy.deepcopy(event)
    event["rawPath"] = path
    event["rawQueryString"] = query
    event["requestContext"]["http"]["path"] = path
    return event


def _invoke(provider: TracerProvider, app: FastAPI, path: str, query: str = "") -> dict:
    """Lambda 計装のスパンと同じ形のスパンの中で、Mangum 経由でリクエストを処理する。"""
    handler = Mangum(wrap_app_for_lambda_tracing(app), lifespan="off")
    target = f"{path}?{query}" if query else path
    with provider.get_tracer("lambda-root").start_as_current_span(
        "sanposcape.aws_lambda.api.handler",
        kind=trace.SpanKind.SERVER,
        attributes={"http.target": target, "http.route": path},
    ):
        return handler(_event(path, query), None)


def _root(exporter: InMemorySpanExporter) -> ReadableSpan:
    return next(s for s in exporter.get_finished_spans() if s.parent is None)


def _child(exporter: InMemorySpanExporter) -> ReadableSpan:
    return next(s for s in exporter.get_finished_spans() if s.parent is not None)


def test_root_span_loses_query_and_is_renamed_by_route_template(
    provider: TracerProvider, exporter: InMemorySpanExporter
) -> None:
    response = _invoke(provider, _app(provider), f"/pins/{_PIN_ID}", "secret=abc&lat=35.1")

    assert response["statusCode"] == 401
    root = _root(exporter)
    assert root.name == "GET /pins/{pin_id}"
    assert root.attributes["http.route"] == "/pins/{pin_id}"
    assert root.attributes["http.target"] == f"/pins/{_PIN_ID}"
    assert "aws.local.operation" not in root.attributes
    values = [str(v) for v in root.attributes.values()]
    assert not [v for v in values if "secret=abc" in v or "35.1" in v or "?" in v]


def test_fastapi_span_is_internal_child_of_the_lambda_root_span(
    provider: TracerProvider, exporter: InMemorySpanExporter
) -> None:
    _invoke(provider, _app(provider), f"/pins/{_PIN_ID}", "secret=abc")

    root, child = _root(exporter), _child(exporter)
    assert root.kind == trace.SpanKind.SERVER
    assert child.kind == trace.SpanKind.INTERNAL
    assert child.parent.span_id == root.context.span_id
    assert child.name == "GET /pins/{pin_id}"
    assert "aws.local.operation" not in child.attributes


def test_client_error_does_not_mark_internal_fastapi_span_as_error(
    provider: TracerProvider, exporter: InMemorySpanExporter
) -> None:
    """INTERNAL の FastAPI スパンで 4xx が ERROR になるか（エラー件数のノイズ確認用の記録）。"""
    response = _invoke(provider, _app(provider), f"/pins/{_PIN_ID}")

    assert response["statusCode"] == 401
    assert _child(exporter).status.status_code != trace.StatusCode.ERROR


def test_unmatched_route_does_not_leak_raw_path_into_name_or_route(
    provider: TracerProvider, exporter: InMemorySpanExporter
) -> None:
    response = _invoke(provider, _app(provider), "/wp-admin/setup-config.php", "x=1")

    assert response["statusCode"] == 404
    root = _root(exporter)
    assert root.name == "GET"
    assert root.attributes["http.route"] == ""
    assert root.attributes["http.target"] == "/wp-admin/setup-config.php"


def test_health_check_still_returns_200_through_the_wrapper(
    provider: TracerProvider, exporter: InMemorySpanExporter
) -> None:
    response = _invoke(provider, _app(provider), "/health")

    assert response["statusCode"] == 200
    assert json.loads(response["body"]) == {"status": "ok"}
    assert _root(exporter).name == "GET /health"


def test_returns_app_unchanged_when_tracing_is_disabled(provider: TracerProvider) -> None:
    app = _app(provider, enabled=False)

    assert wrap_app_for_lambda_tracing(app) is app


def test_returns_app_unchanged_when_opentelemetry_is_unavailable(
    provider: TracerProvider, monkeypatch: pytest.MonkeyPatch
) -> None:
    app = _app(provider)
    monkeypatch.setitem(sys.modules, "opentelemetry.trace", None)

    assert wrap_app_for_lambda_tracing(app) is app


def test_lifespan_scope_passes_through() -> None:
    """http 以外のスコープ（lifespan）は素通しする。Mangum(lifespan="auto") が使う。"""
    app = create_app(Settings(env="test", tracing_enabled=True))
    wrapped = wrap_app_for_lambda_tracing(app)
    received: list[str] = []
    messages = iter([{"type": "lifespan.startup"}, {"type": "lifespan.shutdown"}])

    async def receive() -> dict:
        return next(messages)

    async def send(message: dict) -> None:
        received.append(message["type"])

    asyncio.run(wrapped({"type": "lifespan", "app": app}, receive, send))

    assert received == [
        "lifespan.startup.complete",
        "lifespan.shutdown.complete",
    ]


def test_user_agent_is_blanked_on_the_root_span(
    provider: TracerProvider, exporter: InMemorySpanExporter
) -> None:
    handler = Mangum(wrap_app_for_lambda_tracing(_app(provider)), lifespan="off")
    with provider.get_tracer("lambda-root").start_as_current_span(
        "handler",
        kind=trace.SpanKind.SERVER,
        attributes={"http.user_agent": "secret-agent/1.0"},
    ):
        handler(_event("/health"), None)

    assert _root(exporter).attributes["http.user_agent"] == ""


def test_scrub_failure_blanks_http_target_instead_of_leaving_the_query(
    provider: TracerProvider,
    exporter: InMemorySpanExporter,
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from sanposcape.core import observability

    monkeypatch.setattr(observability, "_WARNED", set())
    tracer = provider.get_tracer("lambda-root")

    with caplog.at_level("WARNING", logger="sanposcape.core.observability"):
        for _ in range(2):
            with tracer.start_as_current_span(
                "handler", attributes={"http.target": "/pins?secret=abc"}
            ) as span:
                _LambdaRootSpanMiddleware._scrub_target(span, {"type": "http"})  # path が無い

    assert [s.attributes["http.target"] for s in exporter.get_finished_spans()] == ["", ""]
    assert len([r for r in caplog.records if r.levelname == "WARNING"]) == 1


# --- ハンドラーの後にイベントから属性を設定し直す Lambda 計装（dev の実測で判明）---


def _lambda_instrumentation_0_61_sets_v2_attributes(lambda_event: dict, span: trace.Span) -> None:
    """ADOT レイヤー v28 同梱の opentelemetry-instrumentation-aws-lambda 0.61b0 の
    `_set_api_gateway_v2_proxy_attributes` の再現（出典: 同パッケージ。dev グループには 0.65b0 の
    依存と衝突して入れられないため、テスト内に写している）。

    この計装は `call_wrapped(*args, **kwargs)`（= Mangum のハンドラー）が**戻った後**に、
    イベントからこれを呼ぶ。ハンドラーの中でスパン属性を書き換えても上書きされる。
    """
    if "domainName" in lambda_event["requestContext"]:
        span.set_attribute("net.host.name", lambda_event["requestContext"]["domainName"])
    http = lambda_event["requestContext"].get("http")
    if http:
        if "method" in http:
            span.set_attribute("http.method", http["method"])
        if "userAgent" in http:
            span.set_attribute("http.user_agent", http["userAgent"])
        if "path" in http:
            span.set_attribute("http.route", http["path"])
            span.set_attribute(
                "http.target",
                f"{http['path']}?{lambda_event['rawQueryString']}"
                if lambda_event.get("rawQueryString")
                else http["path"],
            )


def _invoke_like_lambda_instrumentation(
    provider: TracerProvider, app: FastAPI, path: str, query: str = ""
) -> dict:
    """SERVER スパン開始 → Mangum（補正済み）→ ハンドラーの後に 0.61b0 の属性設定、の順に実行。"""
    handler = Mangum(wrap_app_for_lambda_tracing(app), lifespan="off")
    event = _event(path, query)
    event["requestContext"]["http"]["userAgent"] = "ss178-verify/1.0"
    with provider.get_tracer("lambda-root").start_as_current_span(
        "sanposcape.aws_lambda.api.handler", kind=trace.SpanKind.SERVER
    ) as span:
        response = handler(event, None)
        _lambda_instrumentation_0_61_sets_v2_attributes(event, span)
    return response


def test_attributes_set_by_the_instrumentation_after_the_handler_are_clean(
    provider: TracerProvider, exporter: InMemorySpanExporter
) -> None:
    response = _invoke_like_lambda_instrumentation(
        provider, _app(provider), f"/pins/{_PIN_ID}", "secret=abc123&lat=35.1"
    )

    assert response["statusCode"] == 401
    root = _root(exporter)
    assert root.attributes["http.target"] == "/pins/{pin_id}"
    assert root.attributes["http.route"] == "/pins/{pin_id}"
    assert root.attributes.get("http.user_agent", "") == ""
    values = [str(v) for v in root.attributes.values()]
    assert not [v for v in values if "abc123" in v or "35.1" in v or "?" in v or _PIN_ID in v]
    assert not [v for v in values if "ss178-verify" in v]


def test_unmatched_route_leaves_empty_route_and_target_after_the_instrumentation(
    provider: TracerProvider, exporter: InMemorySpanExporter
) -> None:
    response = _invoke_like_lambda_instrumentation(
        provider, _app(provider), "/no-such-route", "x=1"
    )

    assert response["statusCode"] == 404
    root = _root(exporter)
    assert root.attributes["http.route"] == ""
    assert root.attributes["http.target"] == ""
    assert root.attributes.get("http.user_agent", "") == ""


def test_response_is_unchanged_by_event_sanitization(
    provider: TracerProvider, exporter: InMemorySpanExporter
) -> None:
    response = _invoke_like_lambda_instrumentation(provider, _app(provider), "/health", "a=b")

    assert response["statusCode"] == 200
    assert json.loads(response["body"]) == {"status": "ok"}


def test_v1_events_are_not_touched() -> None:
    event = {"version": "1.0", "rawQueryString": "a=b", "requestContext": {"http": {"path": "/x"}}}

    _LambdaRootSpanMiddleware._sanitize_event({"aws.event": event})

    assert event["rawQueryString"] == "a=b"
    assert event["requestContext"]["http"]["path"] == "/x"


def test_sanitize_failure_still_removes_query_and_user_agent(
    caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    from sanposcape.aws_lambda import tracing
    from sanposcape.core import observability

    monkeypatch.setattr(observability, "_WARNED", set())

    def boom(scope: dict) -> str:
        raise RuntimeError("resolve failed")

    monkeypatch.setattr(tracing, "resolve_route_template", boom)
    event = _event("/pins/x", "secret=abc")
    event["requestContext"]["http"]["userAgent"] = "ua"

    with caplog.at_level("WARNING", logger="sanposcape.core.observability"):
        _LambdaRootSpanMiddleware._sanitize_event({"aws.event": event})

    assert event["rawQueryString"] == ""
    assert "userAgent" not in event["requestContext"]["http"]
    assert event["requestContext"]["http"]["path"] == ""
    assert len([r for r in caplog.records if r.levelname == "WARNING"]) == 1
