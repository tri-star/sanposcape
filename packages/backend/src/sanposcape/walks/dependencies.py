from fastapi import Depends
from sqlalchemy.orm import Session

from sanposcape.database import get_db
from sanposcape.walks.repository import WalkRepository
from sanposcape.walks.service import WalkService


def get_walk_service(db: Session = Depends(get_db)) -> WalkService:
    """request-scoped session を使う WalkService を供給する。"""
    return WalkService(db, WalkRepository(db))
