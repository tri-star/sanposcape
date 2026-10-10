"""Mangum を包んだ Lambda ハンドラーの組み立て（import しても副作用は無い）。

このモジュールは import しただけでは何も起動しない（ハイドレーションも `sanposcape.main`
の import も lifespan の起動もしない）。lifespan が起動するのは `build_handler()` /
`AsgiLambdaHandler()` を呼んだときだけで、呼ぶ順序は `aws_lambda/api.py` が持つ。

★ 同期のコードからだけ呼ぶこと。`AsgiLambdaHandler` は生成時に
`loop.run_until_complete()` で startup を実行するため、実行中のイベントループの中から
呼ぶと失敗する（Lambda のランタイムと同期のテストだけが import / 呼び出しする想定）。

経緯と決定は ADR-005 SS-183 追補を参照。
"""

import asyncio
import logging
from collections.abc import Callable
from typing import Any

from fastapi import FastAPI
from mangum import Mangum
from starlette.types import ASGIApp

from sanposcape.core.observability import log_context

logger = logging.getLogger(__name__)


class AsgiLambdaHandler:
    """Mangum を `lifespan="off"` で包み、FastAPI の lifespan を生成時に1回だけ起動する。

    - Mangum の `lifespan="auto"` は呼び出しごとに startup / shutdown を回す（mangum 0.22.0）。
      そのため `lifespan="off"` にし、lifespan の startup だけを init フェーズで1回実行する。
    - 起動した lifespan のコンテキストマネージャーはこのオブジェクトが保持する。手放すと
      async generator が GC されたときに finalizer がループ上で `aclose()` を走らせ、
      `_lifespan` の finally で資源が close されうる。Lambda ランタイムはハンドラーを
      生かし続けるので、保持していれば構造的に起きない。
    - shutdown は Lambda では走らせない。実行環境が破棄されるときに資源も消える。
      `close()` はテストの後始末専用で、Lambda からは呼ばない。
    - lifespan の state は使えない（`lifespan="off"` の Mangum は state を scope に載せない）。
      state を yield する lifespan は起動時に RuntimeError にして、黙って欠落させない。
    - startup の例外は ERROR ログを出してから再送出する。init の例外はランタイムの
      `post_init_error` が日本語を含むトレースバックで `UnicodeEncodeError` になり原因が
      見えなくなりうる（deployment.md §7）ため。`logger.exception` はトレースバックごと
      出すので、`_lifespan` に「秘密を含みうる例外」を足すときは、入力値を含めない形
      （`api.py` の `ValidationError` は `exc.errors(include_input=False, ...)`）か、
      例外の型名だけを出す形に切り替えること。
    - イベントループ: startup を実行するループと、Mangum の `HTTPCycle` が呼び出しごとに
      使うループは同じでなければならない。lifespan に async の資源（`httpx.AsyncClient` 等）を
      置くなら、この前提に依存する（今の資源はすべて同期でループに依存しない）。
      mangum 0.22.0 の `_setup_event_loop()` は `get_event_loop()` が RuntimeError のときだけ
      `new_event_loop()` + `set_event_loop()` する。3.12 では `get_event_loop()` 自体が警告付きで
      ループを作って set することもある。どちらでも Mangum 生成後の `get_event_loop()` は
      同じループを返すので、生成後に取得している。
    """

    def __init__(
        self, app: FastAPI, *, asgi_wrapper: Callable[[FastAPI], ASGIApp] | None = None
    ) -> None:
        # `asgi_wrapper` は Mangum に渡す ASGI app だけを包む（トレースの親スパン補正。
        # ADR-013 / SS-178）。lifespan は包む前の FastAPI app から起動する。
        asgi_app: ASGIApp = asgi_wrapper(app) if asgi_wrapper is not None else app
        # Mangum がイベントループを用意（必要なら set）してから、同じループを掴む。
        # この順序なら「現在のループが無い」という DeprecationWarning を自分では増やさない。
        self._mangum = Mangum(asgi_app, lifespan="off")
        self._loop = asyncio.get_event_loop()
        self._lifespan = app.router.lifespan_context(app)
        self._closed = False
        try:
            state = self._loop.run_until_complete(self._lifespan.__aenter__())
        except Exception:
            logger.exception("Application startup failed during Lambda init.")
            raise
        # `is not None`（空 dict も拒否）は安全側の意図: state を使う lifespan は、
        # 中身が空でも「使える」と誤解されないよう一律に拒否する。
        if state is not None:
            # 伝播させるのは元の RuntimeError（原因の説明）。後始末の close() が失敗しても
            # それで隠さず、ERROR ログに残すだけにする（init 失敗でプロセスごと捨てられる）。
            try:
                self.close()
            except Exception:
                logger.exception("Closing lifespan failed after rejecting lifespan state.")
            raise RuntimeError(
                "Lifespan state is not supported by AsgiLambdaHandler: "
                "Mangum(lifespan='off') does not pass it to the request scope. "
                "Keep process-wide resources on app.state instead."
            )

    def __call__(self, event: dict[str, Any], context: Any) -> dict[str, Any]:
        # 呼び出しごとに request id を束ねる。Mangum が作るタスクには context がコピーされるので、
        # アプリのログに加え Mangum 自身のログにも付く（`REPORT` 行の `@requestId` と同じ値）。
        # 終わったら reset するので、次の呼び出しに残らない。
        with log_context(aws_request_id=getattr(context, "aws_request_id", None)):
            return self._mangum(event, context)

    def close(self) -> None:
        """lifespan の shutdown を実行する。テスト専用（Lambda からは呼ばない）。

        2回目以降は何もしない。
        """
        if self._closed:
            return
        self._closed = True
        self._loop.run_until_complete(self._lifespan.__aexit__(None, None, None))


def build_handler(
    app: FastAPI, *, asgi_wrapper: Callable[[FastAPI], ASGIApp] | None = None
) -> AsgiLambdaHandler:
    return AsgiLambdaHandler(app, asgi_wrapper=asgi_wrapper)
