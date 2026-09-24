import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response, status

from sanposcape.dependencies import get_current_user
from sanposcape.pins.dependencies import get_pin_service
from sanposcape.pins.schemas import (
    PIN_PHOTO_PAGE_DEFAULT_LIMIT,
    PIN_PHOTO_PAGE_MAX_LIMIT,
    PinConflictErrorRead,
    PinCreate,
    PinListQuery,
    PinListRead,
    PinPhotoListRead,
    PinPhotoPageRead,
    PinPhotosAdd,
    PinRead,
)
from sanposcape.pins.service import PinService
from sanposcape.users.models import User

router = APIRouter(prefix="/pins", tags=["pins"])

# `RequestSizeLimitMiddleware`（core/middleware.py）は `/pins` 配下の全 HTTP メソッドの
# Content-Length をチェックするため、全エンドポイントで一律にこのレスポンスセットを使う
# （walks/router.py と同じ理由）。
_ERROR_RESPONSES = {
    401: {"description": "Not authenticated"},
    413: {"description": "Request body too large"},
}


@router.post(
    "",
    response_model=PinRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="create_pin",
    responses={
        **_ERROR_RESPONSES,
        200: {
            "model": PinRead,
            "description": "Idempotent replay: an existing pin with the same client_pin_id",
        },
        403: {"description": "Permission denied"},
        404: {"description": "Sanpo map not found"},
        409: {
            "model": PinConflictErrorRead,
            "description": "Photo upload not ready, or storage quota exceeded "
            "(see body `code` to distinguish them)",
        },
        422: {"description": "Validation error"},
        503: {"description": "Photo storage unavailable"},
    },
)
def create_pin(
    payload: PinCreate,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    service: PinService = Depends(get_pin_service),
) -> PinRead:
    """ピンの記録を保存する。

    `client_pin_id` の再送は同じピンとして扱い、新規作成のみ 201、冪等な再送は 200 を
    返す（内容が違っても既存をそのまま返す。`walks` と同じ）。`sanpo_map_id` を省略すると
    自分の既定地図（無ければ「最初の地図」を同一トランザクションで作成）に登録される。
    """
    pin, created = service.create_pin(current_user, payload, base_url=str(request.base_url))
    if not created:
        response.status_code = status.HTTP_200_OK
    return pin


@router.post(
    "/{pin_id}/photos",
    response_model=PinPhotoListRead,
    operation_id="add_pin_photos",
    responses={
        **_ERROR_RESPONSES,
        403: {"description": "Permission denied"},
        404: {"description": "Pin not found"},
        409: {
            "model": PinConflictErrorRead,
            "description": "Photo upload not ready, or storage quota exceeded "
            "(see body `code` to distinguish them)",
        },
        422: {"description": "Validation error"},
        503: {"description": "Photo storage unavailable"},
    },
)
def add_pin_photos(
    pin_id: uuid.UUID,
    payload: PinPhotosAdd,
    request: Request,
    current_user: User = Depends(get_current_user),
    service: PinService = Depends(get_pin_service),
) -> PinPhotoListRead:
    """ピンに写真を追加する（1リクエストあたり1〜10枚。ピン全体の枚数は無制限, B-Y2）。

    既にこのピンに紐付いている `upload_id` の再送は成功扱い。別のピンに紐付け済みの
    `upload_id`・存在しない/他人の/期限切れの枠・デコード不可な画像は 409
    （`code: "photo_upload_not_ready"`）。確定時の実サイズで容量上限を超える場合も 409
    （`code: "storage_quota_exceeded"`）。他人のピン・存在しないピンは 404。
    """
    return service.add_photos(current_user, pin_id, payload, base_url=str(request.base_url))


@router.get(
    "",
    response_model=PinListRead,
    operation_id="list_pins",
    responses={
        **_ERROR_RESPONSES,
        400: {"description": "Invalid cursor"},
        404: {"description": "Sanpo map not found"},
        422: {"description": "Validation error"},
    },
)
def list_pins(
    query: Annotated[PinListQuery, Query()],
    request: Request,
    current_user: User = Depends(get_current_user),
    service: PinService = Depends(get_pin_service),
) -> PinListRead:
    """指定した地図のピン一覧を `created_at DESC` の keyset ページングで返す（SS-111）。

    member でない地図・存在しない `sanpo_map_id` は 404。bbox（`min_latitude`/
    `min_longitude`/`max_latitude`/`max_longitude`）は4つそろえて指定するか、
    1つも指定しないかのどちらか。`q`（名前・メモ・タグの部分一致）と `tags`
    （複数指定は AND）は SS-120（検索タブ）向け。各要素の `cover_photo` は
    position が最小の写真（無ければ null）。写真の URL の有効期限は `urls_expire_at`。
    mobile の画像キャッシュのキーには URL ではなく `id` を使う（mobile ADR-010 決定8）。
    """
    return service.list_pins(current_user, query, base_url=str(request.base_url))


# 固定セグメント（例: 将来の `/pins/tags` 等）を足す場合は `/{pin_id}` より前に定義する
# こと（walks/router.py と同じ注意）。`/{pin_id}/photos` は深さが違うため衝突しない。
@router.get(
    "/{pin_id}",
    response_model=PinRead,
    operation_id="get_pin",
    responses={
        **_ERROR_RESPONSES,
        404: {"description": "Pin not found"},
        422: {"description": "Validation error"},
    },
)
def get_pin(
    pin_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    service: PinService = Depends(get_pin_service),
) -> PinRead:
    """ピンの詳細を返す（SS-111）。member でないピン・存在しない ID は 404。

    `photos` は position 順の先頭10件、`photo_count` は総数。全件は
    `GET /pins/{pin_id}/photos` で取得する。写真の URL の有効期限は `urls_expire_at`。
    """
    return service.get_pin(current_user, pin_id, base_url=str(request.base_url))


@router.get(
    "/{pin_id}/photos",
    response_model=PinPhotoPageRead,
    operation_id="list_pin_photos",
    responses={
        **_ERROR_RESPONSES,
        400: {"description": "Invalid cursor"},
        404: {"description": "Pin not found"},
        422: {"description": "Validation error"},
    },
)
def list_pin_photos(
    pin_id: uuid.UUID,
    request: Request,
    limit: int = Query(default=PIN_PHOTO_PAGE_DEFAULT_LIMIT, ge=1, le=PIN_PHOTO_PAGE_MAX_LIMIT),
    cursor: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    service: PinService = Depends(get_pin_service),
) -> PinPhotoPageRead:
    """ピンの写真全件を position 昇順の keyset ページングで返す（ADR-009 決定17）。

    member でないピン・存在しない ID は 404。写真の URL の有効期限は `urls_expire_at`。
    mobile の画像キャッシュのキーには URL ではなく `id` を使う（mobile ADR-010 決定8）。
    """
    return service.list_pin_photos(
        current_user, pin_id, limit=limit, cursor=cursor, base_url=str(request.base_url)
    )
