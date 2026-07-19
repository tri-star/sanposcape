from collections.abc import Sequence

from sanposcape.spots.models import Spot
from sanposcape.spots.repository import SpotRepository
from sanposcape.spots.schemas import SpotCreate


class SpotService:
    """スポットに関するユースケース・ビジネスロジック。"""

    def __init__(self, repository: SpotRepository) -> None:
        self._repository = repository

    def list_spots(self) -> Sequence[Spot]:
        return self._repository.list()

    def create_spot(self, data: SpotCreate) -> Spot:
        return self._repository.create(data)
