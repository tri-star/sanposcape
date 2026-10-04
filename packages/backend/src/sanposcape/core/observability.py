"""リクエスト単位の可観測性（ログ設定とアクセスログ）。

**なぜ必要になったか**: SS-88/SS-106 の実機確認で写真アップロードが失敗した際、
CloudWatch Logs には `START`/`END`/`REPORT` しか残っておらず、「枠発行
（`POST /pin-photo-uploads`）が 201 だったのか 401 だったのか」すら分からなかった。
結局 CloudFront の `4xxErrorRate` メトリクスから推測するしかなく、切り分けに時間を要した。
ローカル（uvicorn）は uvicorn 自身がアクセスログを出すため気付きにくいが、
Lambda（Mangum）には uvicorn が居ないので**アプリ側で出さない限り何も残らない**。

`RequestSizeLimitMiddleware`（`core/middleware.py`）と同じく素の ASGI ミドルウェアとして
書く（BaseHTTPMiddleware を使わない = ストリーミング応答やバックグラウンドタスクの
挙動を変えない）。

---

**トレース（OpenTelemetry。ADR-013 / SS-178）** はこのファイル末尾の独立したセクションにある。
要点:

- **TracerProvider はここでは作らない**（決定7）。Lambda は ADOT レイヤー、ローカルは
  `opentelemetry-instrument`（scripts/start-api.sh）が起動時に作る。ここは「計装を掛ける」だけ。
- 有効化は `Settings.tracing_enabled`（既定 False）。無効なとき、また OTel を import できない
  環境（Lambda の zip には入れない。dev グループ）では、何もしない（import すらしない）。
- **外へ出さない情報（決定6）**: クエリ文字列・ヘッダー・ボディ・SQL のバインド値。
  OTel の ASGI 計装の旧 semconv は `http.url` にクエリ込みの URL を入れるため、フックで除いている。
  `OTEL_SEMCONV_STABILITY_OPT_IN` でオプトインするときは `url.query` / `url.full` も同様に
  除くこと（今は使わない。ADOT の Application Signals が旧 semconv しか読まないため）。
"""

from __future__ import annotations

import contextlib
import logging
import time
from typing import TYPE_CHECKING, Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

if TYPE_CHECKING:
    from fastapi import FastAPI
    from sqlalchemy.engine import Engine

    from sanposcape.config import Settings

logger = logging.getLogger(__name__)


def configure_logging(level: str) -> None:
    """`sanposcape.*` のログを `level` 以上で出力できるようにする。

    ★ ハンドラーを足す条件に注意:
    - Lambda の python ランタイムは **root logger にハンドラーを付ける**ので、ここでは
      レベルだけ設定すれば伝播で出力される（ハンドラーを足すと二重に出る）。
    - uvicorn は自分の（`uvicorn.*`）ロガーしか設定せず root は手付かずなので、
      レベルだけ設定しても `logging.lastResort`（WARNING 相当）止まりで INFO が消える。
      そのため root にもこのロガーにもハンドラーが無いときだけ1つ足す。

    `create_app()` から呼ぶ。複数回呼ばれてもハンドラーは増えない。
    """
    app_logger = logging.getLogger("sanposcape")
    app_logger.setLevel(level)
    if not logging.getLogger().handlers and not app_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
        app_logger.addHandler(handler)


class AccessLogMiddleware:
    """1リクエストにつき1行、`method path -> status (N.Nms)` を INFO で出す。

    意図的に出さないもの:
    - **クエリ文字列**（将来トークン等が載ったときに黙って漏れる経路を作らない）
    - **ヘッダー・ボディ**（同上）

    ★ 逆に言うと **`path` は無条件に出す**。現在のルートのパスパラメータは UUID だけで、
    トークン類はすべてリクエストボディで受けているのでこれで安全だが、この性質を機械的に
    チェックする仕組みは無い。**パスに秘密を載せるルート**（例: メール内リンクのワンタイム
    トークンを `/xxx/{token}` で受ける）を追加するときは、ここを `exclude_paths` に足すか、
    パスをマスクしてから出すかを必ず検討すること（SS-88 のセキュリティレビューの申し送り）。

    `exclude_paths` は既定で `/health` を除く。docker compose のヘルスチェックが 5 秒ごとに
    叩くため、入れておかないとローカルのログが健康診断で埋まる。

    このミドルウェアは **`create_app()` で最後に登録する**こと。Starlette の
    `add_middleware` は先頭に挿入する（= 最後に登録したものが最も外側になる）ので、
    最後に登録して初めて `RequestSizeLimitMiddleware` が返す 413 まで観測できる。
    """

    def __init__(self, app: ASGIApp, *, exclude_paths: tuple[str, ...] = ("/health",)) -> None:
        self.app = app
        self._exclude_paths = exclude_paths

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] in self._exclude_paths:
            await self.app(scope, receive, send)
            return

        started = time.perf_counter()
        # 応答開始前に例外が出た場合（ServerErrorMiddleware が 500 に変換する経路）でも
        # 1行は残す。実際に送られたステータスが分かる場合は send_wrapper が上書きする。
        status = 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            self._log(scope, status, started)
            raise
        self._log(scope, status, started)

    def _log(self, scope: Scope, status: int, started: float) -> None:
        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.info(
            "%s %s -> %d (%.1fms)",
            scope.get("method", "-"),
            scope.get("path", "-"),
            status,
            elapsed_ms,
        )


# ---------------------------------------------------------------------------
# トレース（ADR-013 / SS-178）
# ---------------------------------------------------------------------------
# ★ このセクションは `opentelemetry` をモジュール先頭で import しない（関数内でのみ import）。
#   Lambda の zip には OTel が入らず（ADOT レイヤーが提供）、無効時（既定）や OTel の無い環境でも
#   core が壊れないようにするため。


def _warn_tracing_unavailable(exc: ImportError) -> None:
    logger.warning(
        "TRACING_ENABLED=true だが OpenTelemetry を import できない"
        "ため、トレース無効のまま起動する: %s",
        exc,
    )


_WARNED: set[str] = set()


def warn_once(key: str, message: str, *args: object) -> None:
    """同じ原因の警告を 1 プロセスで 1 回だけ出す（フックはリクエストごとに呼ばれる）。"""
    if key in _WARNED:
        return
    _WARNED.add(key)
    logger.warning(message, *args, exc_info=True)


# 個人情報になりうる標準属性（決定6）。ASGI 計装は `net.peer.ip`（クライアントの IP。Lambda では
# CloudFront のエッジ IP の見込みだが、直接アクセスなら個人の IP）/ `net.peer.port` /
# `http.user_agent`（ヘッダー値）を入れる。API では属性を消せないので空に上書きする。
_PRIVACY_SENSITIVE_ATTRIBUTES = ("net.peer.ip", "net.peer.port", "http.user_agent")


def blank_privacy_sensitive_attributes(span: Any) -> None:
    """`net.peer.*` / `http.user_agent` を空文字に上書きする（FastAPI / Lambda 共用）。"""
    for key in _PRIVACY_SENSITIVE_ATTRIBUTES:
        span.set_attribute(key, "")


def _provider_is_unconfigured(tracer_provider: object | None) -> bool:
    """TracerProvider を誰も構成していない（= no-op のまま）か。"""
    if tracer_provider is not None:
        return False
    from opentelemetry import trace

    return isinstance(trace.get_tracer_provider(), trace.ProxyTracerProvider)


def _url_without_query(scope: Scope) -> str:
    """ASGI scope からクエリ抜きの URL を組み立てる（OTel の ASGI 計装と同じ組み立て）。"""
    from opentelemetry.instrumentation.asgi import get_host_port_url_tuple

    return get_host_port_url_tuple(scope)[2]


def _scrub_query_from_server_span(span: Any, scope: Scope) -> None:
    """ASGI 計装の `server_request_hook`: `http.url` からクエリを除く（決定6）。

    旧 semconv の ASGI 計装は `http.url` にクエリ込みの URL を入れる（`http.target` はパスのみ）。
    トークン類をクエリに載せる経路が将来できても黙って外へ出ないよう、ここで必ず除く。
    あわせて `net.peer.*` / `http.user_agent` を空にする（`blank_privacy_sensitive_attributes`）。
    フックの失敗でリクエストを落とさない。失敗時は安全側（`http.url` を空）に倒す
    （クエリ込みの値を残さない）。警告は 1 回だけ。
    """
    try:
        if span.is_recording():
            blank_privacy_sensitive_attributes(span)
            span.set_attribute("http.url", _url_without_query(scope))
    except Exception:
        warn_once("server-scrub", "http.url からクエリを除けなかったため、空にした")
        with contextlib.suppress(Exception):
            span.set_attribute("http.url", "")


def _scrub_query_from_client_span(span: Any, request_info: Any) -> None:
    """httpx 計装の `request_hook`: 外向きリクエストの `http.url` からクエリ・フラグメントを除く。

    今の Google 呼び出し（Places / Routes。キーは `X-Goog-Api-Key` ヘッダー）の URL にクエリは
    無いが、将来の抜け道（キーをクエリで渡す API の追加等）を塞ぐ。失敗時は安全側（空）に倒す。
    """
    try:
        if span.is_recording():
            url = request_info.url.copy_with(query=None, fragment=None)
            span.set_attribute("http.url", str(url))
    except Exception:
        warn_once(
            "client-scrub", "外向きリクエストの http.url からクエリを除けなかったため、空にした"
        )
        with contextlib.suppress(Exception):
            span.set_attribute("http.url", "")


def resolve_route_template(scope: Scope) -> str | None:
    """ルーティング済みの scope から、prefix を結合したルートのテンプレートを返す。

    例: `/pins/{pin_id}`。ルートに一致していない（404 など）ときは None。生のパスは返さない
    （スパン名・`http.route` のカーディナリティ対策）。

    FastAPI 0.137 以降は `include_router()` したルートがツリー化され、`route.path` が
    prefix を含まなくなる。`iter_route_contexts()` の `context.path`（完全なテンプレート）を
    優先し、見つからなければ `route.path` に倒す。
    """
    route = scope.get("route")
    if route is None:
        return None
    app = scope.get("app")
    if app is not None:
        try:
            from fastapi.routing import iter_route_contexts

            for context in iter_route_contexts(app.routes):
                if getattr(context, "original_route", None) is route:
                    return str(context.path)
        except Exception:
            logger.debug("failed to resolve full route path", exc_info=True)
    path = getattr(route, "path", None)
    return str(path) if path else None


def instrument_fastapi_app(
    app: FastAPI, settings: Settings, *, tracer_provider: object | None = None
) -> None:
    """FastAPI アプリと、リクエスト経路のグローバルな計装（httpx・threading）を有効にする。

    `create_app()` の末尾から呼ぶ（lifespan には置かない。ADR-013 決定7 / SS-183）。
    httpx の計装は lifespan が `httpx.Client` を作るより前に済んでいる必要がある。

    - `settings.tracing_enabled` が False なら何もしない（OTel を import しない）
    - OTel を import できなければ WARNING を出して何もしない
    - TracerProvider が未構成（起動ラッパーを通していない）なら WARNING。計装自体は no-op で動く
    - `/health` は除外、`receive` / `send` の内部スパンは作らない
    - スパン名は FastAPI 計装が `"{METHOD} {route_template}"`、`http.route` も付ける
    """
    if not settings.tracing_enabled:
        return
    # 3 つの計装は個別に守る（1 つ欠けても・失敗しても他は続行し、起動は落とさない。
    # import 時の create_app() から呼ばれるため、ここで例外を出すとプロセスの起動が失敗する）。
    try:
        if _provider_is_unconfigured(tracer_provider):
            logger.warning(
                "TRACING_ENABLED=true だが TracerProvider が構成されていない"
                "（opentelemetry-instrument / ADOT レイヤー経由で起動していない）。"
                "スパンは記録されない"
            )
    except ImportError as exc:
        _warn_tracing_unavailable(exc)
        return

    # グローバルな instrumentor は singleton。create_app() はテストで何度も呼ばれるため冪等にする。
    def _instrument_httpx() -> None:
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

        instrumentor = HTTPXClientInstrumentor()
        if not instrumentor.is_instrumented_by_opentelemetry:
            instrumentor.instrument(
                tracer_provider=tracer_provider, request_hook=_scrub_query_from_client_span
            )

    def _instrument_threading() -> None:
        from opentelemetry.instrumentation.threading import ThreadingInstrumentor

        instrumentor = ThreadingInstrumentor()
        if not instrumentor.is_instrumented_by_opentelemetry:
            # ThreadPoolExecutor のワーカーへ context を伝え、子スパンがリクエストのトレースに
            # 繋がるようにする（maps/service.py の周回ルート、photo_attacher.py の S3 Copy）。
            instrumentor.instrument()

    def _instrument_fastapi() -> None:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        if not getattr(app, "_is_instrumented_by_opentelemetry", False):
            FastAPIInstrumentor.instrument_app(
                app,
                tracer_provider=tracer_provider,
                excluded_urls=r"/health$",
                exclude_spans=["receive", "send"],
                server_request_hook=_scrub_query_from_server_span,
            )

    for name, instrument in (
        ("httpx", _instrument_httpx),
        ("threading", _instrument_threading),
        ("fastapi", _instrument_fastapi),
    ):
        try:
            instrument()
        except ImportError as exc:
            _warn_tracing_unavailable(exc)
        except Exception:
            logger.warning("%s の計装に失敗したため、その計装なしで起動する", name, exc_info=True)


def instrument_sqlalchemy_engine(
    engine: Engine, settings: Settings, *, tracer_provider: object | None = None
) -> None:
    """engine の DB 呼び出しをスパンにする。`get_engine()` が生成直後に呼ぶ。

    SQLAlchemy の instrumentor は singleton で、`instrument(engine=...)` は最初の 1 回だけ効く。
    本番の engine は 1 つ（`lru_cache`）なので問題ない。テストでは `uninstrument()` で後始末する。
    """
    if not settings.tracing_enabled:
        return
    try:
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
    except ImportError as exc:
        _warn_tracing_unavailable(exc)
        return

    instrumentor = SQLAlchemyInstrumentor()
    if instrumentor.is_instrumented_by_opentelemetry:
        return
    try:
        _instrument_engine(
            instrumentor,
            engine,
            tracer_provider=tracer_provider,
            # `db.statement` はプレースホルダ付きの文のまま（バインド値は記録されない）。
            enable_commenter=False,
            # TODO(SS-178): SQLAlchemy 2.1.0 は計装の `_instruments`（< 2.1.0）の依存チェックで
            # 弾かれるため回避する。upstream の修正後に外す:
            # https://github.com/open-telemetry/opentelemetry-python-contrib/issues/5118
            skip_dep_check=True,
        )
    except Exception:
        # トレースのために DB アクセスを落とさない（get_engine() の中で呼ばれる）。
        # 例: 計装が `sqlalchemy.ext.asyncio` を import するため greenlet が無いと ImportError。
        logger.warning("SQLAlchemy の計装に失敗したため、DB のスパンは記録されない", exc_info=True)


def _safe_error_description(exception: BaseException | None) -> str:
    """スパンの status 説明用。例外の型名と SQLSTATE だけ（メッセージは入れない）。

    psycopg の例外の文字列は `DETAIL: Key (provider_subject)=(...)` のように一意制約違反の
    キー値（Google の sub 等）を含む。SQLSTATE が取れなければ型名のみ。
    """
    if exception is None:
        return "Error"
    name = type(exception).__name__
    orig = getattr(exception, "orig", exception)
    sqlstate = getattr(orig, "sqlstate", None) or getattr(orig, "pgcode", None)
    return f"{name} (SQLSTATE {sqlstate})" if sqlstate else name


def _handle_error_without_message(context: Any) -> None:
    """計装の `handle_error` リスナーの代替（ADR-013 決定6 / D11 A 案）。

    upstream の `_handle_error` は `span.set_status(ERROR, str(original_exception))` として
    例外の文字列をそのまま記録する。それ以外（スパンの取得・終了）は同じ挙動にする。
    """
    # ★ リスナーの中の例外は SQLAlchemy の例外（IntegrityError 等）を置き換えてしまい、
    #   アプリの `except IntegrityError`（savepoint の再試行）が壊れる。必ず握る。
    try:
        span = getattr(context.execution_context, "_otel_span", None)
        if span is None:
            return
        try:
            if span.is_recording():
                from opentelemetry.trace import Status, StatusCode

                span.set_status(
                    Status(StatusCode.ERROR, _safe_error_description(context.original_exception))
                )
        finally:
            span.end()
    except Exception:
        warn_once("handle-error", "SQLAlchemy のエラースパンの記録に失敗した")


def _instrument_engine(instrumentor: Any, engine: Engine, **kwargs: Any) -> None:
    """計装を掛け、`handle_error` リスナーを「メッセージを記録しない版」に差し替える。

    ★ 計装の非公開名（`opentelemetry.instrumentation.sqlalchemy.engine._handle_error`）と、
      `context.execution_context._otel_span` に依存する。版を上げて壊れたら
      `core/tests/test_tracing.py` の D11 のテストが落ちる（フェイルクローズ: 外せなかったときは
      メッセージが漏れないよう、この engine の計装リスナーをすべて外してスパンを諦める）。
    """
    from opentelemetry.instrumentation.sqlalchemy import engine as otel_engine
    from sqlalchemy import event

    tracer = instrumentor.instrument(engine=engine, **kwargs)
    try:
        event.remove(engine, "handle_error", otel_engine._handle_error)
        # `uninstrument()` が外し済みのリスナーを再度 remove して失敗しないよう、
        # 計装側の登録簿からも消す。
        registry = type(tracer)._remove_event_listener_params
        registry[:] = [
            entry
            for entry in registry
            if not (entry[0]() is engine and entry[2] is otel_engine._handle_error)
        ]
    except Exception:
        # フェイルクローズ: 元のリスナー（メッセージを記録する）を残さない。
        try:
            tracer.remove_all_event_listeners()
        except Exception:
            logger.warning("計装のリスナーを外せなかった", exc_info=True)
        raise
    event.listen(engine, "handle_error", _handle_error_without_message)


def record_exception_on_current_span(exc: BaseException) -> None:
    """例外ハンドラーで 5xx に変換した例外を、現在のスパンに記録する。

    ハンドラーで処理された例外は OTel のミドルウェアまで伝わらず、スパンに残らない。
    記録するのは**例外の型名だけ**（`span.record_exception` は使わない: スタックトレースは
    `__cause__` の連鎖を含み、httpx / botocore の URL や S3 のキーが載りうるため。決定6）。
    OTel が無い・スパンが記録中でないときは何もしない。
    """
    try:
        from opentelemetry import trace
    except ImportError:
        return
    span = trace.get_current_span()
    if not span.is_recording():
        return
    type_name = type(exc).__name__
    span.add_event("exception", {"exception.type": type(exc).__qualname__})
    span.set_status(trace.Status(trace.StatusCode.ERROR, type_name))
