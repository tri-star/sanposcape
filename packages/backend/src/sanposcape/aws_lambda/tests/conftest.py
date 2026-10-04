"""`aws_lambda/tests/` 共通の部品（Lambda アダプタの境界を再現するフィクスチャとヘルパー）。"""

import asyncio
import json
from collections.abc import Callable, Generator
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI

from sanposcape.aws_lambda.asgi_handler import AsgiLambdaHandler, build_handler

EVENTS_DIR = Path(__file__).resolve().parents[4] / "events"


@pytest.fixture
def lambda_event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """Lambda では1つのイベントループが実行環境の寿命のあいだ生き続ける。それを再現する。

    mangum の `HTTPCycle` は呼び出しのたびに `asyncio.get_event_loop()` を使う。他のテストの
    `asyncio.run()` は終了時に `set_event_loop(None)` するため、ループを用意しないと
    テストの実行順序によって RuntimeError になる。
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        yield loop
    finally:
        loop.close()
        asyncio.set_event_loop(None)


@pytest.fixture
def make_handler(
    lambda_event_loop: asyncio.AbstractEventLoop,
) -> Generator[Callable[[FastAPI], AsgiLambdaHandler], None, None]:
    """`build_handler(app)` を呼び、teardown でループを閉じる前に `close()` を呼ぶ。

    ループを閉じる前に lifespan を正しく閉じないと、async generator が閉じられないまま
    残る（`lambda_event_loop` より先に teardown されるよう依存させている）。
    """
    handlers: list[AsgiLambdaHandler] = []

    def _make(app: FastAPI) -> AsgiLambdaHandler:
        handler = build_handler(app)
        handlers.append(handler)
        return handler

    yield _make

    for handler in handlers:
        handler.close()


def _make_event(
    method: str,
    path: str,
    *,
    body: dict[str, Any] | None = None,
    source_ip: str = "203.0.113.1",
) -> dict[str, Any]:
    """`events/health-get.json`（payload format 2.0）を元に API 呼び出しのイベントを作る。"""
    event = json.loads((EVENTS_DIR / "health-get.json").read_text())
    event["rawPath"] = path
    event["requestContext"]["http"].update(method=method, path=path, sourceIp=source_ip)
    if body is not None:
        event["body"] = json.dumps(body)
        event["headers"]["content-type"] = "application/json"
    return event


@pytest.fixture
def make_event() -> Callable[..., dict[str, Any]]:
    return _make_event
