from fastapi import Depends, Request
from sqlalchemy.orm import Session

from sanposcape.config import Settings, get_settings
from sanposcape.database import get_db
from sanposcape.integrations.aws.s3 import ObjectStorage
from sanposcape.sanpo_maps.photos.repository import PinPhotoUploadRepository
from sanposcape.sanpo_maps.photos.service import PinPhotoUploadService


def get_object_storage(request: Request) -> ObjectStorage:
    """App-lifespan singleton（`maps/dependencies.py` の `get_google_maps_provider` と同じ形）。

    router のテストはこの依存を直接差し替えられる。
    """
    return request.app.state.object_storage


def get_pin_photo_upload_service(
    db: Session = Depends(get_db),
    storage: ObjectStorage = Depends(get_object_storage),
    settings: Settings = Depends(get_settings),
) -> PinPhotoUploadService:
    return PinPhotoUploadService(
        db,
        PinPhotoUploadRepository(db),
        storage,
        max_byte_size=settings.pin_photo_max_bytes,
        user_quota_bytes=settings.pin_photo_user_quota_bytes,
        max_pending_uploads=settings.pin_photo_max_pending_uploads,
        upload_url_ttl_seconds=settings.pin_photo_upload_url_ttl_seconds,
        attach_ttl_seconds=settings.pin_photo_upload_attach_ttl_seconds,
    )
