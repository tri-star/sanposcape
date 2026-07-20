from collections.abc import Sequence

from sqlalchemy.orm import Session

from sanposcape.spots.models import Spot
from sanposcape.spots.repository import SpotRepository
from sanposcape.spots.schemas import SpotCreate


class SpotService:
    """スポットに関するユースケース・ビジネスロジック。トランザクション境界を持つ。"""

    def __init__(self, db: Session, repository: SpotRepository) -> None:
        self._db = db
        self._repository = repository

    def list_spots(self) -> Sequence[Spot]:
        return self._repository.list()

    def create_spot(self, data: SpotCreate) -> Spot:
        spot = self._repository.create(data)
        self._db.commit()
        return spot
