from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from sanposcape.auth.dev_router import router as auth_dev_router
from sanposcape.auth.exceptions import (
    AuthenticationError,
    IdentityProviderUnavailableError,
    InvalidAccessTokenError,
    InvalidIdTokenError,
    InvalidRefreshTokenError,
    RefreshTokenReuseDetectedError,
    UnsupportedProviderError,
)
from sanposcape.auth.router import router as auth_router
from sanposcape.config import Settings, get_settings
from sanposcape.core.middleware import RequestBodyTooLargeError, RequestSizeLimitMiddleware
from sanposcape.core.pagination import InvalidCursorError
from sanposcape.health.router import router as health_router
from sanposcape.integrations.google_maps.client import build_google_maps_provider
from sanposcape.maps.exceptions import MapsQuotaError, MapsUnavailableError
from sanposcape.maps.rate_limit import ExploreRateLimiter
from sanposcape.maps.router import router as maps_router
from sanposcape.spots.router import router as spots_router
from sanposcape.users.router import router as users_router
from sanposcape.walks.exceptions import WalkNotFoundError
from sanposcape.walks.router import router as walks_router


def _unauthorized_response(detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content={"detail": detail},
        headers={"WWW-Authenticate": "Bearer"},
    )


def register_exception_handlers(app: FastAPI) -> None:
    """auth ドメインの例外を HTTP レスポンスへ変換する。

    router には try/except を書かず、ここに一元化する（folder-structure.md の方針）。
    `RequestBodyTooLargeError` / `RequestSizeLimitMiddleware` の実体は
    `core/middleware.py` にある（413を返す経路の定義とハンドラ登録がファイルを
    跨ぐため、両者を見比べたい場合は必ず両方を確認すること）。
    """

    @app.exception_handler(InvalidIdTokenError)
    async def _invalid_id_token(request: Request, exc: InvalidIdTokenError) -> JSONResponse:
        return _unauthorized_response("Invalid ID token")

    @app.exception_handler(RequestBodyTooLargeError)
    async def _request_body_too_large(
        request: Request, exc: RequestBodyTooLargeError
    ) -> JSONResponse:
        return JSONResponse(status_code=413, content={"detail": "Request body too large"})

    @app.exception_handler(InvalidAccessTokenError)
    async def _invalid_access_token(request: Request, exc: InvalidAccessTokenError) -> JSONResponse:
        return _unauthorized_response("Not authenticated")

    @app.exception_handler(InvalidRefreshTokenError)
    async def _invalid_refresh_token(
        request: Request, exc: InvalidRefreshTokenError
    ) -> JSONResponse:
        return _unauthorized_response("Invalid refresh token")

    @app.exception_handler(RefreshTokenReuseDetectedError)
    async def _refresh_token_reuse(
        request: Request, exc: RefreshTokenReuseDetectedError
    ) -> JSONResponse:
        return _unauthorized_response("Invalid refresh token")

    @app.exception_handler(UnsupportedProviderError)
    async def _unsupported_provider(
        request: Request, exc: UnsupportedProviderError
    ) -> JSONResponse:
        # 通常は SessionCreate.provider の Literal 検証で 422 になるため到達しない保険。
        return JSONResponse(status_code=400, content={"detail": "Unsupported provider"})

    @app.exception_handler(IdentityProviderUnavailableError)
    async def _idp_unavailable(
        request: Request, exc: IdentityProviderUnavailableError
    ) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": "Identity provider unavailable"})

    @app.exception_handler(AuthenticationError)
    async def _unclassified_authentication_error(
        request: Request, exc: AuthenticationError
    ) -> JSONResponse:
        """保険ハンドラ: 上記の具象サブクラスに対するハンドラは Starlette が MRO で
        最も具体的なものを優先して呼ぶため、通常はここに落ちない。将来 `auth/exceptions.py`
        に新しいサブクラスを追加したのにここへの登録を忘れても、素の 500 ではなく
        「認証失敗は必ず 401」という規約を維持したまま安全側に倒すためのフォールバック。
        """
        return _unauthorized_response("Authentication failed")

    @app.exception_handler(MapsQuotaError)
    async def _maps_quota(request: Request, exc: MapsQuotaError) -> JSONResponse:
        return JSONResponse(status_code=429, content={"detail": "Map provider quota exceeded"})

    @app.exception_handler(MapsUnavailableError)
    async def _maps_unavailable(request: Request, exc: MapsUnavailableError) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": "Map provider unavailable"})

    @app.exception_handler(WalkNotFoundError)
    async def _walk_not_found(request: Request, exc: WalkNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": "Walk not found"})

    @app.exception_handler(InvalidCursorError)
    async def _invalid_cursor(request: Request, exc: InvalidCursorError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": "Invalid cursor"})


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Keep the Maps HTTP client and its process-local cache alive across requests."""
    provider = build_google_maps_provider(app.state.settings)
    app.state.google_maps_provider = provider
    app.state.explore_rate_limiter = ExploreRateLimiter(
        app.state.settings.google_maps_rate_limit_requests,
        app.state.settings.google_maps_rate_limit_window_seconds,
    )
    try:
        yield
    finally:
        close = getattr(provider, "close", None)
        if callable(close):
            close()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(
        title="sanposcape API",
        version="0.1.0",
        description="散歩支援アプリ sanposcape のバックエンド API",
        lifespan=_lifespan,
    )
    app.state.settings = settings
    # add_middleware は登録順と逆順に実行される。path_prefix で対象を絞っているため
    # 2回登録しても互いの対象パスには影響しない。
    app.add_middleware(
        RequestSizeLimitMiddleware,
        path_prefix="/walks",
        max_bytes=settings.walks_request_max_bytes,
    )
    app.add_middleware(
        RequestSizeLimitMiddleware,
        path_prefix="/explore",
        max_bytes=settings.google_maps_explore_request_max_bytes,
    )
    app.include_router(health_router)
    app.include_router(spots_router)
    app.include_router(auth_router)
    app.include_router(users_router)
    app.include_router(maps_router)
    app.include_router(walks_router)
    if settings.auth_mode == "dev":
        # 本番ではエンドポイント自体が存在しない（ADR-002 決定4）。
        # dev_router 側で include_in_schema=False を指定しているため、
        # include されても OpenAPI スキーマには現れない（D6）。
        app.include_router(auth_dev_router)
    register_exception_handlers(app)
    return app


app = create_app()  # Dockerfile の `uvicorn sanposcape.main:app` を維持するため必須
