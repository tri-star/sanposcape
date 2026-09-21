from fastapi import APIRouter, Depends, Request, status

from sanposcape.dependencies import get_current_user
from sanposcape.pins.dependencies import get_pin_photo_upload_service
from sanposcape.pins.schemas import PinPhotoUploadCreate, PinPhotoUploadRead
from sanposcape.pins.service import PinPhotoUploadService
from sanposcape.users.models import User

router = APIRouter(prefix="/pin-photo-uploads", tags=["pins"])


@router.post(
    "",
    response_model=PinPhotoUploadRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="create_pin_photo_upload",
    responses={
        401: {"description": "Not authenticated"},
        409: {"description": "Storage quota exceeded"},
        413: {"description": "Request body too large, or photo exceeds the size limit"},
        422: {"description": "Validation error"},
        429: {"description": "Too many pending uploads"},
        503: {"description": "Photo storage unavailable"},
    },
)
def create_pin_photo_upload(
    payload: PinPhotoUploadCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    service: PinPhotoUploadService = Depends(get_pin_photo_upload_service),
) -> PinPhotoUploadRead:
    """写真のアップロード枠（presigned POST）を発行する。

    応答の `upload.fields` を multipart フォームで `upload.url` へ POST する
    （フィールドの意味はクライアントが解釈しない）。上限は応答の `max_byte_size` が正。
    """
    return service.create_upload(current_user, payload, base_url=str(request.base_url))
