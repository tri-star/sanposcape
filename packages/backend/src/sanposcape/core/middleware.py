from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class RequestBodyTooLargeError(Exception):
    """Raised before an oversized chunked body can be fully buffered.

    413 への変換は `sanposcape.main.register_exception_handlers()` 側で
    行っている（アプリ全体の例外→HTTPレスポンス変換を一元化する方針のため）。
    このモジュール単体を読んでいる場合は、必ず `main.py` の
    `register_exception_handlers` も合わせて確認すること。
    """


class RequestSizeLimitMiddleware:
    """Streaming request-size guard for a given path prefix; works without Content-Length.

    Originally `/explore` 専用だったが、`/walks`（軌跡を含むため上限が異なる）にも
    同じ仕組みが必要になったため `path_prefix` を引数化して汎用化した（D9）。
    複数の path_prefix に別々の上限を掛けたい場合は、`app.add_middleware()` を
    prefix ごとに複数回呼び出す（呼び出し側は `main.py` の `create_app()`）。

    413 を実際に返す経路（例外ハンドラの登録）は `main.py` 側にあるので、
    このミドルウェアだけを直そうとしても 413 が返らない（500 になる）ことに注意する。
    """

    def __init__(self, app: ASGIApp, path_prefix: str, max_bytes: int) -> None:
        self.app = app
        self._path_prefix = path_prefix
        self._max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not self._matches_prefix(scope["path"]):
            await self.app(scope, receive, send)
            return
        content_length = dict(scope.get("headers", [])).get(b"content-length")
        if (
            content_length is not None
            and content_length.isdigit()
            and int(content_length) > self._max_bytes
        ):
            await self._send_too_large(scope, receive, send)
            return

        received_bytes = 0

        async def limited_receive() -> Message:
            nonlocal received_bytes
            message = await receive()
            if message["type"] == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > self._max_bytes:
                    raise RequestBodyTooLargeError()
            return message

        try:
            await self.app(scope, limited_receive, send)
        except RequestBodyTooLargeError:
            await self._send_too_large(scope, receive, send)

    def _matches_prefix(self, path: str) -> bool:
        # startswith だけだと `/walksfoo` のような将来の別ルートまで誤マッチするため、
        # prefix 完全一致か、prefix + "/" で始まる場合のみ対象にする（C-2）。
        return path == self._path_prefix or path.startswith(self._path_prefix + "/")

    @staticmethod
    async def _send_too_large(scope: Scope, receive: Receive, send: Send) -> None:
        await JSONResponse(status_code=413, content={"detail": "Request body too large"})(
            scope, receive, send
        )
