"""Lambda 計装のスパン（親スパン）の補正（ADR-013 / SS-178）。

ADOT レイヤーは Lambda ハンドラーを OTel の Lambda 計装（`aws_lambda`）で包み、ハンドラーの
実行全体を SERVER スパン（Application Signals の LOCAL_ROOT）にする。Mangum 構成では FastAPI の
スパン（ASGI 計装）はその**子の INTERNAL スパン**になる。この親スパンには次の 2 つの問題がある。

1. **`http.target` にクエリが入る**: payload 2.0 のイベントでは `path?rawQueryString` を入れる
   （ADR-013 決定6: クエリ文字列は外へ出さない）。この計装にはフックが無く、FastAPI 側のフックの
   中の current span は FastAPI のスパンなので、親には触れない。
2. **スパン名・`http.route` がルート単位にならない**: 名前は関数名（ハンドラー名）、`http.route` は
   生のパス（`/pins/<uuid>` のような高カーディナリティ）になる。ルート別の集計
   （`aws/spans` を `http.route` / スパン名で集計する Logs Insights。SS-179）の対象はこの
   LOCAL_ROOT のスパンなので、ルートのテンプレートで付け直す。

そこで Mangum に渡す ASGI app を 1 枚包む。この位置は OTel の ASGI ミドルウェアより外側なので、
`trace.get_current_span()` が Lambda 計装のスパンを返す。

★ `aws.local.operation` は設定しない。ADOT は Lambda 上の LOCAL_ROOT の操作名を
  `<関数名>/FunctionHandler` に固定し、アプリ側の上書きは効かない（dev の実データで確認。
  ADR-013 決定2 の追補）。API 全体の RED は Application Signals、ルート別の内訳は
  `aws/spans` の Logs Insights で見る。

Lambda 計装のスパンの属性の形を前提にしたコードなので `aws_lambda/` に置く（ADR-005 決定3）。
`TRACING_ENABLED` が false、または OTel を import できないときは app をそのまま返す。
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from starlette.types import ASGIApp, Receive, Scope, Send

from sanposcape.core.observability import resolve_route_template

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = logging.getLogger(__name__)


class _LambdaRootSpanMiddleware:
    """Lambda 計装のスパンから、クエリを除き、ルートのテンプレートで名前を付け直す。"""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        from opentelemetry import trace

        span = trace.get_current_span()
        self._scrub_target(span, scope)
        try:
            await self.app(scope, receive, send)
        finally:
            # 例外が出る経路（500）でもルートは分かるので finally で付ける。
            self._rename(span, scope)

    @staticmethod
    def _scrub_target(span: Any, scope: Scope) -> None:
        try:
            if span.is_recording():
                # `scope["path"]` はクエリを含まない。
                span.set_attribute("http.target", scope["path"])
        except Exception:
            logger.debug("failed to scrub http.target", exc_info=True)

    @staticmethod
    def _rename(span: Any, scope: Scope) -> None:
        try:
            if not span.is_recording():
                return
            method = scope.get("method", "HTTP")
            # Router が `scope.update(child_scope)` で同じ dict を書き換えるため、外側からも
            # `scope["route"]` が見える。
            route = resolve_route_template(scope)
            if route:
                span.update_name(f"{method} {route}")
                span.set_attribute("http.route", route)
            else:
                # ルートに一致しない（404 など）。生のパスを名前・http.route に残さない
                # （Lambda 計装は `http.route` に生のパスを入れるため、空で上書きする）。
                span.update_name(method)
                span.set_attribute("http.route", "")
        except Exception:
            logger.debug("failed to rename lambda root span", exc_info=True)


def wrap_app_for_lambda_tracing(app: FastAPI) -> ASGIApp:
    """Mangum に渡す ASGI app を、親スパン補正のミドルウェアで包む。

    無効（`app.state.settings.tracing_enabled` が False）、または OTel を import できない
    ときは `app` をそのまま返す。lifespan など http 以外のスコープは素通しする。
    """
    settings = getattr(app.state, "settings", None)
    if settings is None or not settings.tracing_enabled:
        return app
    try:
        import opentelemetry.trace  # noqa: F401
    except ImportError:
        return app
    return _LambdaRootSpanMiddleware(app)
