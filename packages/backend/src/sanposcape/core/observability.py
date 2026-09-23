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
"""

import logging
import time

from starlette.types import ASGIApp, Message, Receive, Scope, Send

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
