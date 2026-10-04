"""Lambda アダプタの境界で「lifespan の資源を実行環境で使い回す」ことを固定するテスト（SS-183）。

TestClient は lifespan を1回しか回さないため、「呼び出しごとに lifespan が走る」不具合
（mangum の `lifespan="auto"`）は TestClient では検出できない。ここでは実際の mangum を通して
**同じハンドラーを複数回呼び出す**ことで、Lambda の暖かい実行環境を再現する。
"""

import asyncio
import gc
import io
import json
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any

import pytest
from botocore.exceptions import ClientError
from fastapi import FastAPI, Request

from sanposcape.aws_lambda.asgi_handler import AsgiLambdaHandler, build_handler
from sanposcape.config import Settings
from sanposcape.integrations.google_maps.provider import ProviderPoint, ProviderRoute
from sanposcape.main import create_app
from sanposcape.maps.dependencies import get_maps_service
from sanposcape.maps.service import MapsService

_STATE_NAMES = (
    "google_maps_provider",
    "explore_rate_limiter",
    "feature_flag_source",
    "feature_flags",
    "object_storage",
)


class _Resource:
    """`close()` の呼び出し回数を数えるだけのフェイク資源。"""

    def __init__(self, registry: "_Registry", name: str) -> None:
        self._registry = registry
        self._name = name

    def close(self) -> None:
        self._registry.closed[self._name] += 1


class _Registry:
    def __init__(self) -> None:
        self.built = {"provider": 0, "flag_source": 0, "storage": 0}
        self.closed = {"provider": 0, "flag_source": 0, "storage": 0}


@pytest.fixture
def counting_builders(monkeypatch: pytest.MonkeyPatch) -> _Registry:
    """`sanposcape.main` の `build_*` を、生成・close の回数を数えるフェイクに差し替える。

    `main.py` は `from ... import build_x` しているため、パッチ先は `sanposcape.main.build_x`。
    """
    registry = _Registry()

    def _builder(name: str) -> Callable[[Settings], _Resource]:
        def _build(settings: Settings) -> _Resource:
            registry.built[name] += 1
            return _Resource(registry, name)

        return _build

    monkeypatch.setattr("sanposcape.main.build_google_maps_provider", _builder("provider"))
    monkeypatch.setattr("sanposcape.main.build_flag_document_source", _builder("flag_source"))
    monkeypatch.setattr("sanposcape.main.build_object_storage", _builder("storage"))
    return registry


def _app_with_state_probe(settings: Settings | None = None) -> tuple[FastAPI, list[dict[str, Any]]]:
    """呼び出しごとの `app.state` を強参照で記録するテスト専用ルートを足した app。

    `id()` ではなく強参照を保持して `is` で比べる。`auto` では1回目の資源が解放された
    あとに同じ id が再利用されることがあり、偶然一致して偽の green になりうるため。
    """
    app = create_app(settings or Settings(env="test"))
    seen: list[dict[str, Any]] = []

    @app.get("/_probe")
    def _probe(request: Request) -> dict[str, bool]:
        seen.append({name: getattr(request.app.state, name) for name in _STATE_NAMES})
        return {"ok": True}

    return app, seen


def test_state_is_reused_across_invocations(
    make_handler: Callable[[FastAPI], AsgiLambdaHandler],
    make_event: Callable[..., dict[str, Any]],
    counting_builders: _Registry,
) -> None:
    app, seen = _app_with_state_probe()
    handler = make_handler(app)

    for _ in range(2):
        assert handler(make_event("GET", "/_probe"), None)["statusCode"] == 200

    assert len(seen) == 2
    for name in _STATE_NAMES:
        assert seen[0][name] is seen[1][name], name


def test_resources_are_built_once_and_never_closed_across_invocations(
    make_handler: Callable[[FastAPI], AsgiLambdaHandler],
    make_event: Callable[..., dict[str, Any]],
    counting_builders: _Registry,
) -> None:
    app, _ = _app_with_state_probe()
    handler = make_handler(app)

    for _ in range(3):
        assert handler(make_event("GET", "/health"), None)["statusCode"] == 200

    assert counting_builders.built == {"provider": 1, "flag_source": 1, "storage": 1}
    assert counting_builders.closed == {"provider": 0, "flag_source": 0, "storage": 0}


class _RoutingProvider:
    def search_places(self, *args: Any, **kwargs: Any) -> tuple[()]:
        return ()

    def get_walking_route(self, *args: Any, **kwargs: Any) -> ProviderRoute:
        return ProviderRoute(1, 1, (ProviderPoint(35, 139), ProviderPoint(35.1, 139.1)))


def test_explore_rate_limit_persists_across_invocations(
    make_handler: Callable[[FastAPI], AsgiLambdaHandler],
    make_event: Callable[..., dict[str, Any]],
) -> None:
    """レート制限の状態が呼び出しをまたいで残る（`auto` では毎回リセットされ 429 にならない）。"""
    app = create_app(
        Settings(
            env="test",
            google_maps_rate_limit_requests=2,
            google_maps_anonymous_rate_limit_requests=1,
        )
    )
    app.dependency_overrides[get_maps_service] = lambda: MapsService(
        _RoutingProvider(), 20, 20, 10, 8
    )
    handler = make_handler(app)
    payload = {
        "origin": {"latitude": 35, "longitude": 139},
        "destination": {"place_id": "opaque", "location": {"latitude": 35.1, "longitude": 139.1}},
    }

    def _post(source_ip: str) -> int:
        event = make_event("POST", "/explore/routes/walking", body=payload, source_ip=source_ip)
        return handler(event, None)["statusCode"]

    assert _post("203.0.113.1") == 200
    assert _post("203.0.113.1") == 429
    # バケットは IP ごと。別の IP は影響を受けない。
    assert _post("203.0.113.2") == 200


class _FakeAppConfigClient:
    """appconfigdata クライアントのフェイク。呼び出し回数を数え、GetLatest の応答を差し替える。"""

    def __init__(self, get_latest_responses: list[Any]) -> None:
        self.start_calls = 0
        self.get_latest_calls = 0
        self._responses = get_latest_responses

    def start_configuration_session(self, **kwargs: Any) -> dict[str, str]:
        self.start_calls += 1
        return {"InitialConfigurationToken": "token-0"}

    def get_latest_configuration(self, **kwargs: Any) -> dict[str, Any]:
        index = min(self.get_latest_calls, len(self._responses) - 1)
        self.get_latest_calls += 1
        response = self._responses[index]
        if isinstance(response, Exception):
            raise response
        # StreamingBody は1回しか読めないので、呼び出しごとに新しく作る。
        return {**response, "Configuration": io.BytesIO(response["Configuration"])}

    def close(self) -> None:
        pass


def _flag_response(poll_interval: int, *, enabled: bool = True) -> dict[str, Any]:
    body = json.dumps({"pin_registration": {"enabled": enabled}}).encode()
    return {
        "NextPollConfigurationToken": "token-next",
        "NextPollIntervalInSeconds": poll_interval,
        "Configuration": body,
    }


def _appconfig_app(monkeypatch: pytest.MonkeyPatch, client: _FakeAppConfigClient) -> FastAPI:
    monkeypatch.setattr(
        "sanposcape.integrations.aws.appconfig.boto3.client", lambda *a, **k: client
    )
    return create_app(
        Settings(
            env="test",
            feature_flag_mode="real",
            appconfig_application_id="app",
            appconfig_environment_id="env",
            appconfig_configuration_profile_id="profile",
        )
    )


def test_appconfig_session_is_opened_once_across_invocations(
    make_handler: Callable[[FastAPI], AsgiLambdaHandler],
    make_event: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`/app-config` を2回呼んでも、セッションの開始と取得は1回ずつ（ポーリング間隔内）。"""
    client = _FakeAppConfigClient([_flag_response(60)])
    handler = make_handler(_appconfig_app(monkeypatch, client))

    for _ in range(2):
        response = handler(make_event("GET", "/app-config"), None)
        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["config_source"] == "appconfig"
        assert body["flags"] == {"pin_registration": True}

    assert client.start_calls == 1
    assert client.get_latest_calls == 1


def test_appconfig_known_good_survives_fetch_failure_across_invocations(
    make_handler: Callable[[FastAPI], AsgiLambdaHandler],
    make_event: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """ADR-008 決定9-1 の境界版。取得に失敗しても、直前の正常値を呼び出しをまたいで維持する。"""
    error = ClientError({"Error": {"Code": "InternalServerException", "Message": "x"}}, "Get")
    client = _FakeAppConfigClient([_flag_response(0), error])
    handler = make_handler(_appconfig_app(monkeypatch, client))

    first = json.loads(handler(make_event("GET", "/app-config"), None)["body"])
    second = json.loads(handler(make_event("GET", "/app-config"), None)["body"])

    assert first["flags"] == {"pin_registration": True}
    assert second["flags"] == {"pin_registration": True}
    assert second["config_source"] == "appconfig"
    assert client.get_latest_calls == 2


def test_lifespan_is_not_closed_by_garbage_collection(
    make_handler: Callable[[FastAPI], AsgiLambdaHandler],
    make_event: Callable[..., dict[str, Any]],
    counting_builders: _Registry,
) -> None:
    """lifespan の CM をハンドラーが保持していること（手放すと GC 後に finalizer が
    ループ上で `aclose()` を予約し、次の呼び出しで資源が close されてしまう）。
    """
    app, _ = _app_with_state_probe()
    handler = make_handler(app)

    gc.collect()
    assert handler(make_event("GET", "/health"), None)["statusCode"] == 200
    gc.collect()
    assert handler(make_event("GET", "/health"), None)["statusCode"] == 200

    assert counting_builders.closed == {"provider": 0, "flag_source": 0, "storage": 0}


def test_close_runs_lifespan_shutdown_once(
    make_handler: Callable[[FastAPI], AsgiLambdaHandler],
    counting_builders: _Registry,
    caplog: pytest.LogCaptureFixture,
) -> None:
    handler = make_handler(create_app(Settings(env="test")))

    with caplog.at_level(logging.INFO, logger="sanposcape.main"):
        handler.close()
        handler.close()

    assert counting_builders.closed == {"provider": 1, "flag_source": 1, "storage": 1}
    shutdowns = [r for r in caplog.records if "Application lifespan shutting down" in r.message]
    assert len(shutdowns) == 1


def test_startup_failure_is_logged_and_raised(
    lambda_event_loop: asyncio.AbstractEventLoop,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    def _boom(settings: Settings) -> None:
        raise ValueError("storage init failed")

    monkeypatch.setattr("sanposcape.main.build_object_storage", _boom)
    app = create_app(Settings(env="test"))

    with caplog.at_level(logging.ERROR), pytest.raises(ValueError, match="storage init failed"):
        build_handler(app)

    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert [r.message for r in errors] == ["Application startup failed during Lambda init."]
    # 注意: 失敗前に作られた資源（provider など）は閉じられない（`_lifespan` の既存の挙動。
    # try の前に作るため finally に入らない）。Lambda では init 失敗でプロセスごと捨てられる。


def test_lifespan_state_is_rejected(lambda_event_loop: asyncio.AbstractEventLoop) -> None:
    """Mangum(lifespan="off") は state を載せないため、黙って欠落させず起動時に失敗する。"""
    closed: list[bool] = []

    @asynccontextmanager
    async def _lifespan_with_state(app: FastAPI) -> AsyncIterator[dict[str, int]]:
        try:
            yield {"x": 1}
        finally:
            closed.append(True)

    with pytest.raises(RuntimeError, match="state is not supported"):
        build_handler(FastAPI(lifespan=_lifespan_with_state))

    # 失敗した init でも資源は閉じる。
    assert closed == [True]


def test_startup_log_is_emitted_once_across_invocations(
    make_handler: Callable[[FastAPI], AsgiLambdaHandler],
    make_event: Callable[..., dict[str, Any]],
    counting_builders: _Registry,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """dev の事後確認（ログストリームごとに started が1件・shutting down が0件）と同じ観点。"""
    with caplog.at_level(logging.INFO, logger="sanposcape.main"):
        app, _ = _app_with_state_probe()
        handler = make_handler(app)
        for _ in range(3):
            assert handler(make_event("GET", "/health"), None)["statusCode"] == 200

        messages = [r.message for r in caplog.records if r.name == "sanposcape.main"]

    assert sum("Application lifespan started" in m for m in messages) == 1
    assert sum("Application lifespan shutting down" in m for m in messages) == 0


def test_handler_can_be_built_when_no_event_loop_is_set(
    make_event: Callable[..., dict[str, Any]],
) -> None:
    """ループが set されていない状態（他のテストの `asyncio.run()` の後など）でも、Mangum が
    ループを用意し、`AsgiLambdaHandler` はそれを掴んで startup と呼び出しを行える。
    """
    asyncio.set_event_loop(None)
    handler = None
    try:
        handler = build_handler(create_app(Settings(env="test")))
        assert handler(make_event("GET", "/health"), None)["statusCode"] == 200
    finally:
        if handler is not None:
            handler.close()
            handler._loop.close()  # Mangum が用意したループ（テスト専用に private を参照）
        asyncio.set_event_loop(None)
