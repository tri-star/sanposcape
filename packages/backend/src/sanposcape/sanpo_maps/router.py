from fastapi import APIRouter, Depends

from sanposcape.dependencies import get_current_user
from sanposcape.sanpo_maps.dependencies import get_sanpo_map_service
from sanposcape.sanpo_maps.schemas import SanpoMapListRead
from sanposcape.sanpo_maps.service import SanpoMapService
from sanposcape.users.models import User

router = APIRouter(prefix="/sanpo-maps", tags=["sanpo-maps"])


@router.get(
    "",
    response_model=SanpoMapListRead,
    operation_id="list_sanpo_maps",
    responses={401: {"description": "Not authenticated"}},
)
def list_sanpo_maps(
    current_user: User = Depends(get_current_user),
    service: SanpoMapService = Depends(get_sanpo_map_service),
) -> SanpoMapListRead:
    """自分が member である地図を全件返す（クエリなし。MVP は件数が少ない前提）。"""
    return service.list_maps(current_user)
