from fastapi import Depends, Request
from sqlalchemy.orm import Session

from sanposcape.config import Settings, get_settings
from sanposcape.database import get_db
from sanposcape.integrations.aws.s3 import ObjectStorage
from sanposcape.pins.photo_attacher import PhotoAttacher
from sanposcape.pins.repository import PinPhotoUploadRepository, PinRepository
from sanposcape.pins.schemas import PIN_READ_PHOTOS_LIMIT
from sanposcape.pins.service import PinPhotoUploadService, PinService
from sanposcape.sanpo_maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.service import SanpoMapService


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


def get_pin_service(
    db: Session = Depends(get_db),
    storage: ObjectStorage = Depends(get_object_storage),
    settings: Settings = Depends(get_settings),
) -> PinService:
    # `pins → sanpo_maps` の依存方向を保つため、SanpoMapService は
    # `sanpo_maps/dependencies.py` の `Depends` チェーンを経由せず直接組み立てる。
    sanpo_map_service = SanpoMapService(db, SanpoMapRepository(db))
    photo_attacher = PhotoAttacher(
        storage,
        max_bytes=settings.pin_photo_max_bytes,
        max_pixels=settings.pin_photo_max_pixels,
        thumbnail_max_edge=settings.pin_photo_thumbnail_max_edge_px,
        thumbnail_quality=settings.pin_photo_thumbnail_jpeg_quality,
        concurrency=settings.pin_photo_confirm_concurrency,
    )
    return PinService(
        db,
        PinRepository(db),
        PinPhotoUploadRepository(db),
        sanpo_map_service,
        photo_attacher,
        storage,
        user_quota_bytes=settings.pin_photo_user_quota_bytes,
        confirm_deadline_seconds=settings.pin_photo_confirm_deadline_seconds,
        read_photos_limit=PIN_READ_PHOTOS_LIMIT,
        download_url_ttl_seconds=settings.pin_photo_download_url_ttl_seconds,
        photo_delete_deadline_seconds=settings.pin_photo_delete_deadline_seconds,
        photo_delete_call_worst_case_seconds=settings.object_storage_delete_call_worst_case_seconds,
    )
