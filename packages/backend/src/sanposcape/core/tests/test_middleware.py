import asyncio

from sanposcape.core.middleware import RequestSizeLimitMiddleware


def _run_middleware(path: str, *, path_prefix: str = "/walks", max_bytes: int = 4) -> list[dict]:
    """`scope["path"]` が `path` のリクエストをミドルウェアへ通し、送信されたメッセージを返す。"""
    sent: list[dict] = []

    async def inner_app(scope, receive, send) -> None:
        await receive()  # 実際の ASGI app と同様にボディを読み取ってから応答する
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    async def receive() -> dict:
        return {"type": "http.request", "body": b"12345", "more_body": False}

    async def send(message: dict) -> None:
        sent.append(message)

    scope = {"type": "http", "path": path, "headers": []}
    asyncio.run(
        RequestSizeLimitMiddleware(inner_app, path_prefix=path_prefix, max_bytes=max_bytes)(
            scope, receive, send
        )
    )
    return sent


class TestRequestSizeLimitMiddlewarePathMatching:
    """C-2: `startswith` のみだと `/walksfoo` のような将来のルートまで誤マッチするため、
    prefix 完全一致か `prefix + "/"` で始まる場合のみ対象にすることを固定する。
    """

    def test_exact_prefix_match_is_size_limited(self) -> None:
        sent = _run_middleware("/walks")

        assert sent[0]["status"] == 413

    def test_prefix_with_trailing_slash_is_size_limited(self) -> None:
        sent = _run_middleware("/walks/123")

        assert sent[0]["status"] == 413

    def test_unrelated_path_sharing_prefix_characters_is_not_size_limited(self) -> None:
        sent = _run_middleware("/walksfoo")

        assert sent[0]["status"] == 200

    def test_unrelated_path_is_not_size_limited(self) -> None:
        sent = _run_middleware("/other")

        assert sent[0]["status"] == 200
