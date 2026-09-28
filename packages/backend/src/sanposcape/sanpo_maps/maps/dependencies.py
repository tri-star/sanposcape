from fastapi import Depends
from sqlalchemy.orm import Session

from sanposcape.database import get_db
from sanposcape.sanpo_maps.maps.access import SanpoMapAccess
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.maps.service import SanpoMapService
from sanposcape.sanpo_maps.photos.cleanup import PhotoObjectCleaner
from sanposcape.sanpo_maps.photos.dependencies import get_photo_object_cleaner


def get_sanpo_map_access(db: Session = Depends(get_db)) -> SanpoMapAccess:
    """request-scoped session を使う SanpoMapAccess を供給する（`pins/dependencies.py`
    から使う）。
    """
    return SanpoMapAccess(SanpoMapRepository(db))


def get_sanpo_map_service(
    db: Session = Depends(get_db),
    photo_cleaner: PhotoObjectCleaner = Depends(get_photo_object_cleaner),
) -> SanpoMapService:
    """request-scoped session を使う SanpoMapService を供給する。"""
    return SanpoMapService(db, SanpoMapRepository(db), photo_cleaner)
