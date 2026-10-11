"""リクエスト単位のアクセスログ（`AccessLogMiddleware`）。

**なぜ必要になったか**: SS-88/SS-106 の実機確認で写真アップロードが失敗した際、
CloudWatch Logs には `START`/`END`/`REPORT` しか残っておらず、「枠発行
（`POST /pin-photo-uploads`）が 201 だったのか 401 だったのか」すら分からなかった。
結局 CloudFront の `4xxErrorRate` メトリクスから推測するしかなく、切り分けに時間を要した。
ローカル（uvicorn）は uvicorn 自身がアクセスログを出すため気付きにくいが、
Lambda（Mangum）には uvicorn が居ないので**アプリ側で出さない限り何も残らない**。

`RequestSizeLimitMiddleware`（`core/middleware.py`）と同じく素の ASGI ミドルウェアとして
書く（BaseHTTPMiddleware を使わない = ストリーミング応答やバックグラウンドタスクの
挙動を変えない）。

依存は `access_log → logs → tracing` の一方向（このモジュールは `observability` を import しない）。
"""

from __future__ import annotations

import logging
import time

from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from sanposcape.core.logs import log_context
from sanposcape.core.tracing import record_exception_on_current_span, warn_once

# ★ 分割前と同じロガー名に固定する（`logger` フィールドが出力の一部のため。`tracing.py` 参照）。
logger = logging.getLogger("sanposcape.core.observability")


class UnhandledErrorAfterResponseStart(Exception):  # noqa: N818
    """応答の開始後に未処理例外が出たことを、サーバー（Mangum / uvicorn）に伝えるための例外。

    メッセージも原因（`__cause__`）も持たない（`raise ... from None`）。元の例外のメッセージが
    Mangum の `logger.exception` 経由でログに残る抜け道を作らないため。
    """


class AccessLogMiddleware:
    """1リクエストにつき1行、`method path -> status (N.Nms)` を出す（JSON では下記の項目つき）。

    `extra` で `log_type="access"` / `http_status_code` / `duration_ms` を付ける。
    レベル: 未処理例外 → ERROR（`exc_info` つき）/ 例外ハンドラーで変換した 5xx（503 など）→
    WARNING（発生元が既に ERROR を出している場合があり、二重の ERROR にしない）/ それ以外 INFO。

    意図的に出さないもの:
    - **クエリ文字列**（将来トークン等が載ったときに黙って漏れる経路を作らない）
    - **ヘッダー・ボディ**（同上）

    ★ 逆に言うと **`path` は無条件に `message` に出す**（`http_route` はテンプレートなので安全）。
    現在のルートのパスパラメータは UUID だけで、トークン類はすべてリクエストボディで受けて
    いるのでこれで安全だが、この性質を機械的にチェックする仕組みは無い。**パスに秘密を載せる
    ルート**（例: メール内リンクのワンタイムトークンを `/xxx/{token}` で受ける）を追加するときは、
    ここを `exclude_paths` に足すか、パスをマスクしてから出すかを必ず検討すること
    （SS-88 のセキュリティレビューの申し送り）。

    `exclude_paths` は既定で `/health` を除く。docker compose のヘルスチェックが 5 秒ごとに
    叩くため、入れておかないとローカルのログが健康診断で埋まる（成功時のアクセスログだけを
    省く。例外は `/health` でも捕まえて ERROR にする）。

    **未処理例外はここで握り、自分で 500 を返す（再送出しない。SS-180 / ADR-013 決定6）**:
    - ERROR が自分の 1 件だけになる。Mangum（`mangum.http` の `logger.exception`）や uvicorn
      （`Exception in ASGI application`）の二重ログが出ない。
    - OTel の FastAPI 計装の `ExceptionHandlerMiddleware` はユーザーのミドルウェアより外側に
      あり、再送出するとスパンの exception イベントと status に**例外メッセージ**（DB 例外なら
      `DETAIL` のキー値）が自動で載る（R7）。握れば届かない。代わりに
      `record_exception_on_current_span()`（型名だけ）を呼ぶ。
    - 応答は `ServerErrorMiddleware` の既定（debug=False）と同じ `500 Internal Server Error`
      （プレーンテキスト）。Lambda の `Errors` メトリクスにも影響しない。
    - **応答の開始後**の例外だけは握れない（500 に差し替えられない）。ERROR を 1 件出したうえで
      `UnhandledErrorAfterResponseStart` を送出し、Mangum が状態を見て 500 にできるようにする。
      この経路だけは Mangum / uvicorn がもう 1 件 ERROR を出す（メッセージは無害）。今は
      ストリーミング応答も BackgroundTasks も無いので実際には起きない。
    - `BaseException`（`CancelledError` など）は捕まえない。**キャンセルされたリクエストの
      アクセスログは残らない**（切断された接続の追跡が必要になったら別途検討する）。

    このミドルウェアは **`create_app()` で最後に登録する**こと。Starlette の
    `add_middleware` は先頭に挿入する（= 最後に登録したものが最も外側になる）ので、
    最後に登録して初めて `RequestSizeLimitMiddleware` が返す 413 まで観測できる。
    崩れると例外を握る位置も内側にずれる。

    `LogContext` を用意する（Lambda では `AsgiLambdaHandler` が先に用意している）。
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        exclude_paths: tuple[str, ...] = ("/health",),
        tracing_enabled: bool = False,
    ) -> None:
        self.app = app
        self._exclude_paths = exclude_paths
        self._tracing_enabled = tracing_enabled

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        excluded = scope["path"] in self._exclude_paths
        with log_context(http_method=scope.get("method"), scope=scope):
            started = time.perf_counter()
            status = 500
            response_started = False
            failed_after_response_start = False

            async def send_wrapper(message: Message) -> None:
                nonlocal status, response_started
                if message["type"] == "http.response.start":
                    status = message["status"]
                    response_started = True
                await send(message)

            try:
                await self.app(scope, receive, send_wrapper)
            except Exception as exc:
                self._log(scope, status, started, exc=exc)
                self._record_on_span(exc)
                if not response_started:
                    response = PlainTextResponse("Internal Server Error", status_code=500)
                    await response(scope, receive, send)
                    return
                failed_after_response_start = True
            if failed_after_response_start:
                # ★ except 節の**外**で送出する。節内だと元の例外が `__context__` に残り、
                #   Mangum の `logger.exception` などが元のメッセージを描きうる。
                raise UnhandledErrorAfterResponseStart from None
            if not excluded:
                self._log(scope, status, started)

    def _record_on_span(self, exc: BaseException) -> None:
        """スパンへの記録の失敗で 500 の応答を妨げない（except 節の中で呼ばれるため）。"""
        try:
            record_exception_on_current_span(exc, enabled=self._tracing_enabled)
        except Exception:
            warn_once("record-exception", "未処理例外のスパンへの記録に失敗した")

    def _log(
        self, scope: Scope, status: int, started: float, *, exc: BaseException | None = None
    ) -> None:
        elapsed_ms = (time.perf_counter() - started) * 1000
        if exc is not None:
            level = logging.ERROR
        elif status >= 500:
            level = logging.WARNING
        else:
            level = logging.INFO
        logger.log(
            level,
            "%s %s -> %d (%.1fms)%s",
            scope.get("method", "-"),
            scope.get("path", "-"),
            status,
            elapsed_ms,
            ": unhandled exception" if exc is not None else "",
            extra={
                "log_type": "access",
                "http_status_code": status,
                "duration_ms": round(elapsed_ms, 1),
            },
            exc_info=exc,
        )
