from fastapi import Depends
from sqlalchemy.orm import Session

from sanposcape.config import Settings, get_settings
from sanposcape.database import get_db
from sanposcape.integrations.aws.s3 import ObjectStorage
from sanposcape.sanpo_maps.maps.access import SanpoMapAccess
from sanposcape.sanpo_maps.maps.dependencies import get_sanpo_map_access
from sanposcape.sanpo_maps.photos.cleanup import PhotoObjectCleaner
from sanposcape.sanpo_maps.photos.dependencies import get_object_storage, get_photo_object_cleaner
from sanposcape.sanpo_maps.photos.photo_attacher import PhotoAttacher
from sanposcape.sanpo_maps.photos.repository import PinPhotoUploadRepository
from sanposcape.sanpo_maps.pins.repository import PinRepository
from sanposcape.sanpo_maps.pins.schemas import PIN_READ_PHOTOS_LIMIT
from sanposcape.sanpo_maps.pins.service import PinService


def get_pin_service(
    db: Session = Depends(get_db),
    storage: ObjectStorage = Depends(get_object_storage),
    settings: Settings = Depends(get_settings),
    sanpo_map_access: SanpoMapAccess = Depends(get_sanpo_map_access),
    photo_cleaner: PhotoObjectCleaner = Depends(get_photo_object_cleaner),
) -> PinService:
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
        sanpo_map_access,
        photo_attacher,
        photo_cleaner,
        storage,
        user_quota_bytes=settings.pin_photo_user_quota_bytes,
        confirm_deadline_seconds=settings.pin_photo_confirm_deadline_seconds,
        read_photos_limit=PIN_READ_PHOTOS_LIMIT,
        download_url_ttl_seconds=settings.pin_photo_download_url_ttl_seconds,
    )
