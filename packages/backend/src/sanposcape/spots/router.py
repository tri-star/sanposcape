from fastapi import APIRouter, Depends, status

from sanposcape.spots.dependencies import get_spot_service
from sanposcape.spots.schemas import SpotCreate, SpotRead
from sanposcape.spots.service import SpotService

router = APIRouter(prefix="/spots", tags=["spots"])


@router.get("", response_model=list[SpotRead])
def list_spots(service: SpotService = Depends(get_spot_service)):
    return service.list_spots()


@router.post("", response_model=SpotRead, status_code=status.HTTP_201_CREATED)
def create_spot(
    payload: SpotCreate,
    service: SpotService = Depends(get_spot_service),
):
    return service.create_spot(payload)
