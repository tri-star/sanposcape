"""ドメインの例外を HTTP レスポンスへ変換するハンドラの登録（SS-258 で `main.py` から分けた）。

router には try/except を書かず、ここに一元化する（folder-structure.md の方針）。
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from sanposcape.auth.exceptions import (
    AuthenticationError,
    IdentityProviderUnavailableError,
    InvalidAccessTokenError,
    InvalidIdTokenError,
    InvalidRefreshTokenError,
    RefreshTokenReuseDetectedError,
    UnsupportedProviderError,
)
from sanposcape.core.middleware import RequestBodyTooLargeError
from sanposcape.core.observability import (
    record_exception_on_current_span,
)
from sanposcape.core.pagination import InvalidCursorError
from sanposcape.integrations.aws.s3 import ObjectStorageUnavailableError
from sanposcape.maps.exceptions import MapsQuotaError, MapsUnavailableError
from sanposcape.sanpo_maps.exceptions import (
    PinMoveTargetMissingMembersError,
    PinNotFoundError,
    PinPhotoNotFoundError,
    PinPhotoTooLargeError,
    PinPhotoUploadAlreadyAttachedError,
    PinPhotoUploadNotFoundError,
    PinPhotoUploadNotReadyError,
    PinTagLimitExceededError,
    SanpoMapInvitationLimitError,
    SanpoMapInvitationNotFoundError,
    SanpoMapMemberNotFoundError,
    SanpoMapNotFoundError,
    SanpoMapOwnerCannotLeaveError,
    SanpoMapPermissionDeniedError,
    StorageQuotaExceededError,
    TooManyPendingUploadsError,
)
from sanposcape.users.exceptions import AccountDeletionUnavailableError
from sanposcape.walks.exceptions import WalkNotFoundError


def _unauthorized_response(detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content={"detail": detail},
        headers={"WWW-Authenticate": "Bearer"},
    )


def _tracing_enabled(request: Request) -> bool:
    settings = getattr(request.app.state, "settings", None)
    return bool(settings and settings.tracing_enabled)


def register_exception_handlers(app: FastAPI) -> None:
    """ドメインの例外を HTTP レスポンスへ変換する。

    router には try/except を書かず、ここに一元化する（folder-structure.md の方針）。
    登録はドメインごとの関数に分けている（ハンドラの数だけ複雑度が積み上がるため。SS-258）。
    Starlette は例外の MRO で最も具体的なハンドラを選ぶので、登録の順序は結果に影響しない。
    `RequestBodyTooLargeError` / `RequestSizeLimitMiddleware` の実体は
    `core/middleware.py` にある（413を返す経路の定義とハンドラ登録がファイルを
    跨ぐため、両者を見比べたい場合は必ず両方を確認すること）。
    """
    _register_request_handlers(app)
    _register_auth_handlers(app)
    _register_maps_and_walks_handlers(app)
    _register_sanpo_map_handlers(app)
    _register_pin_handlers(app)
    _register_photo_handlers(app)
    _register_account_and_storage_handlers(app)


def _register_request_handlers(app: FastAPI) -> None:
    """リクエストそのものの不備（大きすぎる本文・壊れたカーソル）。"""

    @app.exception_handler(RequestBodyTooLargeError)
    async def _request_body_too_large(
        request: Request, exc: RequestBodyTooLargeError
    ) -> JSONResponse:
        return JSONResponse(status_code=413, content={"detail": "Request body too large"})

    @app.exception_handler(InvalidCursorError)
    async def _invalid_cursor(request: Request, exc: InvalidCursorError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": "Invalid cursor"})


def _register_auth_handlers(app: FastAPI) -> None:
    """auth ドメイン。認証の失敗は必ず 401（ID プロバイダの障害は 503）。"""

    @app.exception_handler(InvalidIdTokenError)
    async def _invalid_id_token(request: Request, exc: InvalidIdTokenError) -> JSONResponse:
        return _unauthorized_response("Invalid ID token")

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
        # Literal にある provider でも、未設定（例: APPLE_ALLOWED_AUDIENCES が空）なら到達する。
        # 未知の provider 文字列は SessionCreate の Literal 検証で 422 になる。
        return JSONResponse(status_code=400, content={"detail": "Unsupported provider"})

    @app.exception_handler(IdentityProviderUnavailableError)
    async def _idp_unavailable(
        request: Request, exc: IdentityProviderUnavailableError
    ) -> JSONResponse:
        # 503 に変換するとこの例外は OTel のミドルウェアまで伝わらないため、スパンに残す。
        record_exception_on_current_span(exc, enabled=_tracing_enabled(request))
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


def _register_maps_and_walks_handlers(app: FastAPI) -> None:
    """地図の提供元（Google Maps）と散歩の記録。"""

    @app.exception_handler(MapsQuotaError)
    async def _maps_quota(request: Request, exc: MapsQuotaError) -> JSONResponse:
        return JSONResponse(status_code=429, content={"detail": "Map provider quota exceeded"})

    @app.exception_handler(MapsUnavailableError)
    async def _maps_unavailable(request: Request, exc: MapsUnavailableError) -> JSONResponse:
        record_exception_on_current_span(exc, enabled=_tracing_enabled(request))
        return JSONResponse(status_code=503, content={"detail": "Map provider unavailable"})

    @app.exception_handler(WalkNotFoundError)
    async def _walk_not_found(request: Request, exc: WalkNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": "Walk not found"})


def _register_sanpo_map_handlers(app: FastAPI) -> None:
    """散歩の地図・メンバー・招待。"""

    @app.exception_handler(SanpoMapNotFoundError)
    async def _sanpo_map_not_found(request: Request, exc: SanpoMapNotFoundError) -> JSONResponse:
        # `code` は ADR-009 決定33（SS-175）。決定12 と同じくハンドラで付ける。全エンドポイントの
        # 404 に付くが、OpenAPI で宣言しているのは PATCH /pins/{pin_id} だけ。`detail` は不変。
        return JSONResponse(
            status_code=404,
            content={"detail": "Sanpo map not found", "code": "sanpo_map_not_found"},
        )

    @app.exception_handler(SanpoMapPermissionDeniedError)
    async def _sanpo_map_permission_denied(
        request: Request, exc: SanpoMapPermissionDeniedError
    ) -> JSONResponse:
        return JSONResponse(status_code=403, content={"detail": "Permission denied"})

    @app.exception_handler(PinMoveTargetMissingMembersError)
    async def _pin_move_target_missing_members(
        request: Request, exc: PinMoveTargetMissingMembersError
    ) -> JSONResponse:
        # ADR-009 決定42（SS-192）。汎用の 403（`Permission denied`）と区別できるよう
        # `code` を付ける。
        return JSONResponse(
            status_code=403,
            content={
                "detail": "Destination sanpo map is missing members of the current sanpo map",
                "code": "move_target_missing_members",
            },
        )

    @app.exception_handler(SanpoMapMemberNotFoundError)
    async def _sanpo_map_member_not_found(
        request: Request, exc: SanpoMapMemberNotFoundError
    ) -> JSONResponse:
        # `DELETE /sanpo-maps/{id}/members/{user_id}` 専用（ADR-009 決定38）。
        return JSONResponse(
            status_code=404,
            content={"detail": "Sanpo map member not found", "code": "sanpo_map_member_not_found"},
        )

    @app.exception_handler(SanpoMapInvitationNotFoundError)
    async def _sanpo_map_invitation_not_found(
        request: Request, exc: SanpoMapInvitationNotFoundError
    ) -> JSONResponse:
        # 招待の API 専用（ADR-009 決定39）。理由（使用済み・期限切れ等）を区別しない。
        return JSONResponse(
            status_code=404,
            content={"detail": "Invitation not found", "code": "invitation_not_found"},
        )

    @app.exception_handler(SanpoMapInvitationLimitError)
    async def _sanpo_map_invitation_limit(
        request: Request, exc: SanpoMapInvitationLimitError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=409, content={"detail": "Invitation limit reached", "code": exc.code}
        )

    @app.exception_handler(SanpoMapOwnerCannotLeaveError)
    async def _sanpo_map_owner_cannot_leave(
        request: Request, exc: SanpoMapOwnerCannotLeaveError
    ) -> JSONResponse:
        # `DELETE /sanpo-maps/{id}/members/{user_id}` 専用（ADR-009 決定38）。
        return JSONResponse(
            status_code=409,
            content={"detail": "Owner cannot leave the sanpo map", "code": "owner_cannot_leave"},
        )


def _register_pin_handlers(app: FastAPI) -> None:
    """ピンとタグ（写真の枠・写真以外）。"""

    @app.exception_handler(PinNotFoundError)
    async def _pin_not_found(request: Request, exc: PinNotFoundError) -> JSONResponse:
        # `code` の扱いは `_sanpo_map_not_found` と同じ（決定33）。
        return JSONResponse(
            status_code=404, content={"detail": "Pin not found", "code": "pin_not_found"}
        )


def _register_photo_handlers(app: FastAPI) -> None:
    """写真のアップロード枠・写真・容量。"""

    @app.exception_handler(PinPhotoUploadNotReadyError)
    async def _pin_photo_upload_not_ready(
        request: Request, exc: PinPhotoUploadNotReadyError
    ) -> JSONResponse:
        # `code` は PR #93 T15 で追加（mobile が 409 の中で「容量超過」と「写真の準備が
        # できていない」を区別できるようにするため）。`detail` の固定文言は既存クライアント
        # との後方互換のため変更しない。
        return JSONResponse(
            status_code=409,
            content={"detail": "Photo upload not ready", "code": "photo_upload_not_ready"},
        )

    @app.exception_handler(StorageQuotaExceededError)
    async def _storage_quota_exceeded(
        request: Request, exc: StorageQuotaExceededError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=409,
            content={"detail": "Storage quota exceeded", "code": "storage_quota_exceeded"},
        )

    @app.exception_handler(PinPhotoTooLargeError)
    async def _pin_photo_too_large(request: Request, exc: PinPhotoTooLargeError) -> JSONResponse:
        return JSONResponse(status_code=413, content={"detail": "Photo too large"})

    @app.exception_handler(TooManyPendingUploadsError)
    async def _too_many_pending_uploads(
        request: Request, exc: TooManyPendingUploadsError
    ) -> JSONResponse:
        return JSONResponse(status_code=429, content={"detail": "Too many pending uploads"})

    @app.exception_handler(PinPhotoUploadNotFoundError)
    async def _pin_photo_upload_not_found(
        request: Request, exc: PinPhotoUploadNotFoundError
    ) -> JSONResponse:
        # `DELETE /pin-photo-uploads/{upload_id}` 専用（PR #93 T11）。
        return JSONResponse(status_code=404, content={"detail": "Pin photo upload not found"})

    @app.exception_handler(PinPhotoUploadAlreadyAttachedError)
    async def _pin_photo_upload_already_attached(
        request: Request, exc: PinPhotoUploadAlreadyAttachedError
    ) -> JSONResponse:
        # `DELETE /pin-photo-uploads/{upload_id}` 専用（PR #93 T11）。
        return JSONResponse(
            status_code=409, content={"detail": "Pin photo upload already attached"}
        )

    @app.exception_handler(PinPhotoNotFoundError)
    async def _pin_photo_not_found(request: Request, exc: PinPhotoNotFoundError) -> JSONResponse:
        # `DELETE /pins/{pin_id}/photos/{photo_id}` 専用（ADR-009 決定21, SS-112）。
        return JSONResponse(status_code=404, content={"detail": "Pin photo not found"})

    @app.exception_handler(PinTagLimitExceededError)
    async def _pin_tag_limit_exceeded(
        request: Request, exc: PinTagLimitExceededError
    ) -> JSONResponse:
        # `PATCH /pins/{pin_id}` 専用（ADR-009 決定20, SS-112）。
        return JSONResponse(
            status_code=409, content={"detail": "Too many tags", "code": "tag_limit_exceeded"}
        )


def _register_account_and_storage_handlers(app: FastAPI) -> None:
    """アカウントの削除と、写真のストレージ（S3）の障害。どちらも一時的な 503。"""

    @app.exception_handler(AccountDeletionUnavailableError)
    async def _account_deletion_unavailable(
        request: Request, exc: AccountDeletionUnavailableError
    ) -> JSONResponse:
        # `DELETE /users/me` 専用（SS-198）。Apple のトークン失効が一時的に失敗したので、
        # アカウントは削除していない。
        record_exception_on_current_span(exc, enabled=_tracing_enabled(request))
        return JSONResponse(
            status_code=503, content={"detail": "Account deletion temporarily unavailable"}
        )

    @app.exception_handler(ObjectStorageUnavailableError)
    async def _object_storage_unavailable(
        request: Request, exc: ObjectStorageUnavailableError
    ) -> JSONResponse:
        record_exception_on_current_span(exc, enabled=_tracing_enabled(request))
        return JSONResponse(status_code=503, content={"detail": "Photo storage unavailable"})
