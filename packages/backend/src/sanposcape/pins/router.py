import uuid

from fastapi import APIRouter, Depends, Request, Response, status

from sanposcape.dependencies import get_current_user
from sanposcape.pins.dependencies import get_pin_service
from sanposcape.pins.schemas import (
    PinConflictErrorRead,
    PinCreate,
    PinPhotoListRead,
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
