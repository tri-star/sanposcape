from fastapi import Depends
from sqlalchemy.orm import Session

from sanposcape.database import get_db
from sanposcape.sanpo_maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.service import SanpoMapService


def get_sanpo_map_service(db: Session = Depends(get_db)) -> SanpoMapService:
    """request-scoped session を使う SanpoMapService を供給する。

    `pins/dependencies.py` は（`pins → sanpo_maps` の依存方向を保つため）この関数を
    `Depends` 経由では使わず、`SanpoMapService(db, SanpoMapRepository(db))` を直接組み立てる。
    """
    return SanpoMapService(db, SanpoMapRepository(db))
