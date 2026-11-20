import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from sanposcape.api_docs.router import router as api_docs_router
from sanposcape.app_config.router import router as app_config_router
from sanposcape.auth.dev_router import router as auth_dev_router
from sanposcape.auth.router import router as auth_router
from sanposcape.config import Settings, get_settings
from sanposcape.core.feature_flags import FeatureFlags
from sanposcape.core.middleware import RequestSizeLimitMiddleware
from sanposcape.core.observability import (
    AccessLogMiddleware,
    configure_logging,
    instrument_fastapi_app,
)
from sanposcape.exception_handlers import register_exception_handlers
from sanposcape.health.router import router as health_router
from sanposcape.integrations.apple.client import build_apple_sign_in_client
from sanposcape.integrations.aws.appconfig import build_flag_document_source
from sanposcape.integrations.aws.s3 import build_object_storage
from sanposcape.integrations.google_maps.client import build_google_maps_provider
from sanposcape.maps.rate_limit import ExploreRateLimiter
from sanposcape.maps.router import router as maps_router
from sanposcape.sanpo_maps.invitations.router import router as sanpo_map_invitations_router
from sanposcape.sanpo_maps.maps.router import router as sanpo_maps_router
from sanposcape.sanpo_maps.photos.dev_storage_router import router as pins_dev_storage_router
from sanposcape.sanpo_maps.photos.router import router as pin_photo_uploads_router
from sanposcape.sanpo_maps.pins.router import router as pins_router
from sanposcape.users.router import router as users_router
from sanposcape.walks.router import router as walks_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Keep process-wide resources alive across requests.

    Maps の HTTP クライアントとキャッシュ、レート制限、フラグの取得元（AppConfig）、
    S3 クライアント、Apple の REST API クライアント。

    close は uvicorn / TestClient の終了時に走る。Lambda では起動は実行環境ごとに1回で、
    終了は走らない（`aws_lambda/asgi_handler.py`、ADR-005 SS-183 追補）。コードは Lambda を
    知らないままにしている（ADR-005 決定3）。
    """
    provider = build_google_maps_provider(app.state.settings)
    app.state.google_maps_provider = provider
    app.state.explore_rate_limiter = ExploreRateLimiter(
        app.state.settings.google_maps_rate_limit_requests,
        app.state.settings.google_maps_anonymous_rate_limit_requests,
        app.state.settings.google_maps_rate_limit_window_seconds,
    )
    # 招待の preview・accept 用（探索 API とは別の枠。SS-250, ADR-009 決定39）。
    app.state.invitation_rate_limiter = ExploreRateLimiter(
        app.state.settings.invitation_rate_limit_requests,
        app.state.settings.invitation_anonymous_rate_limit_requests,
        app.state.settings.invitation_rate_limit_window_seconds,
    )
    # 散歩の保存用（ユーザー単位だけ。探索・招待とは別の枠。SS-38）。`POST /walks` は認証必須で
    # 匿名の枠は使われないので、匿名の上限には同じ値を渡しておく。
    app.state.walk_create_rate_limiter = ExploreRateLimiter(
        app.state.settings.walk_create_rate_limit_requests,
        app.state.settings.walk_create_rate_limit_requests,
        app.state.settings.walk_create_rate_limit_window_seconds,
        limit_authenticated_ip=False,
    )
    # コールドスタートでは AppConfig を取りに行かない（インスタンスを作るだけ）。
    # 最初にフラグを参照したリクエスト（/app-config 等）が取得する。/app-config 以外の
    # コールドスタートに AppConfig のレイテンシを乗せないため（ADR-008 追補 D3）。
    app.state.feature_flag_source = build_flag_document_source(app.state.settings)
    app.state.feature_flags = FeatureFlags(app.state.feature_flag_source)
    # クライアントの生成のみ（ネットワークに出ない）。real/fake/unconfigured の切替は
    # `build_object_storage()` に集約している（B-D8）。
    app.state.object_storage = build_object_storage(app.state.settings)
    # Apple の REST API（code の交換・トークンの失効。SS-198）。鍵が無ければ Unconfigured
    # （起動は止めない）。ここで 1 回だけ作り、設定ミスのログも 1 回だけ出す。
    apple_sign_in_client = build_apple_sign_in_client(app.state.settings)
    app.state.apple_sign_in_client = apple_sign_in_client
    logger.info("Application lifespan started: process-wide resources are ready.")
    try:
        yield
    finally:
        logger.info("Application lifespan shutting down: closing process-wide resources.")
        for closeable in (
            provider,
            app.state.feature_flag_source,
            app.state.object_storage,
            apple_sign_in_client,
        ):
            close = getattr(closeable, "close", None)
            if callable(close):
                close()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    # ルーターや依存関係が組み立て中に出すログも拾えるよう、最初に呼ぶ。
    configure_logging(
        settings.log_level,
        log_format=settings.log_format,
        tracing_enabled=settings.tracing_enabled,
        include_exception_messages=settings.log_exception_messages,
    )
    app = FastAPI(
        title="sanposcape API",
        version="0.1.0",
        description="散歩支援アプリ sanposcape のバックエンド API",
        lifespan=_lifespan,
        # 既定の Swagger UI（/docs）と ReDoc（/redoc）は使わない。/docs は Scalar
        # （api_docs/router.py）に置き換え、/redoc は廃止する（SS-131）。
        # `/openapi.json`（既定の openapi_url）は実行時に Scalar が読むため全環境で
        # そのまま残す。mobile の Orval はコミット済みの openapi.yaml
        # （scripts/export_openapi.py の出力）を読むのであって、実行時の
        # `/openapi.json` 自体には依存しない（誤認しやすいので明記する）。
        docs_url=None,
        redoc_url=None,
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
    app.add_middleware(
        RequestSizeLimitMiddleware,
        path_prefix="/sanpo-maps",
        max_bytes=settings.pins_request_max_bytes,
    )
    app.add_middleware(
        RequestSizeLimitMiddleware,
        path_prefix="/invitations",
        max_bytes=settings.pins_request_max_bytes,
    )
    app.add_middleware(
        RequestSizeLimitMiddleware,
        path_prefix="/pins",
        max_bytes=settings.pins_request_max_bytes,
    )
    app.add_middleware(
        RequestSizeLimitMiddleware,
        path_prefix="/pin-photo-uploads",
        max_bytes=settings.pins_request_max_bytes,
    )
    if settings.storage_mode == "fake":
        # `/dev-storage/*` は本番に存在しない（router 自体が include されない）が、
        # local/test では写真本体を受ける経路になるため `/pins` と同じ理由で上限を課す
        # （PR #93 T2。`pins_dev_storage_router.py` の `file.read()` は検証前に本文全体を
        # メモリへ読み込むため、この経路が対象外だと任意サイズの body でメモリを消費させられる）。
        app.add_middleware(
            RequestSizeLimitMiddleware,
            path_prefix="/dev-storage",
            max_bytes=settings.dev_storage_request_max_bytes,
        )
    # ★ 必ず最後に登録する（= 最も外側になる）。こうしないと RequestSizeLimitMiddleware が
    #   自前で返す 413 を観測できず、アクセスログのステータスが実際の応答とずれる。
    app.add_middleware(AccessLogMiddleware, tracing_enabled=settings.tracing_enabled)
    app.include_router(health_router)
    app.include_router(app_config_router)
    app.include_router(auth_router)
    app.include_router(users_router)
    app.include_router(maps_router)
    app.include_router(walks_router)
    app.include_router(sanpo_maps_router)
    app.include_router(sanpo_map_invitations_router)
    app.include_router(pins_router)
    app.include_router(pin_photo_uploads_router)
    if settings.auth_mode == "dev":
        # 本番ではエンドポイント自体が存在しない（ADR-002 決定4）。
        # dev_router 側で include_in_schema=False を指定しているため、
        # include されても OpenAPI スキーマには現れない（D6）。
        app.include_router(auth_dev_router)
    if settings.storage_mode == "fake":
        # 本番では存在しない（router 自体が include されない。include_in_schema=False も
        # あわせて指定しており、二重の安全策になっている）。
        app.include_router(pins_dev_storage_router)
    if settings.env in ("local", "test", "staging"):
        # 許可リスト方式（`!= "production"` にしない理由は config.py と同じ: 新しい env 値が
        # 増えても既定では `/docs` を出さない安全側に倒すため）。production では
        # `/docs` 自体が存在しない（router が include されない）。
        app.include_router(api_docs_router)
    register_exception_handlers(app)
    # トレースの計装（ADR-013）。`settings.tracing_enabled` が False なら何もしない。
    # ★ lifespan には置かない（決定7 / SS-183: Mangum の lifespan を使わなくなっても動くように）。
    #   httpx の計装は、lifespan が Google Maps と Apple の `httpx.Client` を作るより前に
    #   済ませる必要があるため、ここ（= import 時の create_app()）で行う。
    instrument_fastapi_app(app, settings)
    return app


app = create_app()  # Dockerfile の `uvicorn sanposcape.main:app` を維持するため必須
