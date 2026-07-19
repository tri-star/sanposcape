from fastapi import Depends
from sqlalchemy.orm import Session

from sanposcape.database import get_db
from sanposcape.spots.repository import SpotRepository
from sanposcape.spots.service import SpotService


def get_spot_service(db: Session = Depends(get_db)) -> SpotService:
    return SpotService(SpotRepository(db))
