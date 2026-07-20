from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from sanposcape.spots.models import Spot
from sanposcape.spots.schemas import SpotCreate


class SpotRepository:
    """spots テーブルへの DB アクセスを隔離する層。"""

    def __init__(self, db: Session) -> None:
        self._db = db

    def list(self) -> Sequence[Spot]:
        return self._db.scalars(select(Spot).order_by(Spot.created_at.desc())).all()

    def create(self, data: SpotCreate) -> Spot:
        spot = Spot(**data.model_dump())
        self._db.add(spot)
        self._db.flush()
        self._db.refresh(spot)
        return spot
