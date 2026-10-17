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
import re
import time
from typing import Any

from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from sanposcape.core.logs import current_span_attributes, log_context
from sanposcape.core.tracing import (
    annotate_span,
    capture_current_span,
    record_exception_on_current_span,
    warn_once,
)

# `X-App-Session-Id` ヘッダー（アプリの起動ごとの UUID v4。mobile が付ける想定で、
# まだ送っていない）。クライアント由来の信頼できない入力なので、
# 小文字の正規形の UUID v4 だけを受ける。
_APP_SESSION_ID_HEADER = b"x-app-session-id"
_APP_SESSION_ID_LENGTH = 36
_APP_SESSION_ID_PATTERN = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
)


def _read_app_session_id(scope: Scope) -> str | None:
    """`X-App-Session-Id` を検証して返す。受け付けられない値は None（理由は出さない）。

    - 同名のヘッダーが 1 件でなければ捨てる（どれが正か曖昧なため）。
    - 長さ（bytes）が 36 でなければ、デコードも正規表現にもかけずに捨てる（長い値を渡さない）。
    - ASCII でデコードできない、小文字の UUID v4 の形でない値も捨てる。
    不正な値は**ログにもスパンにも出さず**（警告も出さない）、リクエストも拒否しない。
    """
    values = [
        value for name, value in scope.get("headers", []) if name.lower() == _APP_SESSION_ID_HEADER
    ]
    if len(values) != 1 or len(values[0]) != _APP_SESSION_ID_LENGTH:
        return None
    try:
        text = values[0].decode("ascii")
    except UnicodeDecodeError:
        return None
    return text if _APP_SESSION_ID_PATTERN.fullmatch(text) else None


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

    **`X-App-Session-Id`**（mobile がアプリの起動ごとに付ける UUID v4）は、検証を通ったときだけ
    `LogContext.app_session_id`（ログの `app_session_id`、スパンの `session.id`）に載せる。
    routing より前に読むので、401 / 404 / 413 のアクセスログにも付く。
    **クライアント由来の信頼できない入力**として扱う: 小文字の UUID v4 以外・同名の複数ヘッダー・
    長さ違いは捨て、捨てた値は**どこにも出さず**（警告も出さない）、リクエストも拒否しない
    （可観測性で可用性を落とさない）。
    用途は調査の目印だけで、認可・レート制限・重複排除には使わない（他人の ID を名乗れても
    影響は自分のリクエストの印が変わるだけ。同じ ID が同じ端末の証明にもならない）。
    OpenAPI には載せない（ルートの引数にすると `openapi.yaml` が変わり、mobile の CI が走るため）。

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
        with log_context(
            http_method=scope.get("method"),
            scope=scope,
            app_session_id=_read_app_session_id(scope),
        ):
            started = time.perf_counter()
            status = 500
            response_started = False
            failed_after_response_start = False
            # ★ 入口でサーバースパンを捕まえる（OTel の ASGI 計装の内側なので、ここではサーバー
            #   スパンが current）。送信時の current は手動の子スパン内だと子スパンになるため、
            #   送信時に current を引かない。記録中でなければ None で、以降は何もしない。
            server_span = capture_current_span(enabled=self._tracing_enabled)

            async def send_wrapper(message: Message) -> None:
                nonlocal status, response_started
                if message["type"] == "http.response.start":
                    status = message["status"]
                    response_started = True
                    # ★ 応答の開始時に写す。ユーザー ID を bind する認証の依存は、応答の開始より
                    #   前に走っている。
                    self._annotate_span(server_span)
                elif message["type"] == "http.response.body" and not message.get("more_body"):
                    # ★ 最後の body を送る「前」にもう一度写す。OTel の ASGI 計装は最後の body を
                    #   送るとサーバースパンを終えるので、送った後では遅い。ストリーミング中に
                    #   bind された値もここで載る。
                    self._annotate_span(server_span)
                await send(message)

            try:
                await self.app(scope, receive, send_wrapper)
            except Exception as exc:
                self._log(scope, status, started, exc=exc)
                self._record_on_span(exc)
                if not response_started:
                    self._annotate_span(
                        server_span
                    )  # 応答の開始前の例外。スパンはまだ終わっていない
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

    def _annotate_span(self, span: Any | None) -> None:
        """`LogContext` のユーザー ID・セッション ID を、入口で捕まえたサーバースパンに写す。

        `bind_user_id` の docstring を参照。前提: `span` はミドルウェア入口の current span
        （OTel の ASGI 計装の内側）で、その時点で記録中だったもの。None（トレース無効・記録中
        でない）なら `current_span_attributes()` も計算せず返る。既に終わったスパンへは
        `set_span_attributes` が書かない。記録の失敗で応答を妨げない。
        """
        if span is None:
            return
        try:
            annotate_span(span, current_span_attributes())
        except Exception:
            warn_once(
                "annotate-span", "スパンへの属性（ユーザー ID・セッション ID）の記録に失敗した"
            )

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
