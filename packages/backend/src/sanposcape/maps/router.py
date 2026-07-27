from fastapi import APIRouter, Depends

from sanposcape.maps.dependencies import enforce_explore_rate_limit, get_maps_service
from sanposcape.maps.schemas import (
    PlaceSearchRequest,
    PlaceSearchResponse,
    WalkingRouteRequest,
    WalkingRouteResponse,
)
from sanposcape.maps.service import MapsService

router = APIRouter(prefix="/explore", tags=["explore"])

_ERROR_RESPONSES = {
    401: {"description": "Not authenticated"},
    429: {"description": "Map provider quota exceeded"},
    503: {"description": "Map provider unavailable"},
}


@router.post(
    "/places",
    response_model=PlaceSearchResponse,
    operation_id="search_explore_places",
    responses=_ERROR_RESPONSES,
)
def search_places(
    payload: PlaceSearchRequest,
    service: MapsService = Depends(get_maps_service),
    _rate_limit: None = Depends(enforce_explore_rate_limit),
) -> PlaceSearchResponse:
    return service.search_places(payload)


@router.post(
    "/routes/walking",
    response_model=WalkingRouteResponse,
    operation_id="get_walking_route_explore_routes_walking",
    responses=_ERROR_RESPONSES,
)
def get_walking_route(
    payload: WalkingRouteRequest,
    service: MapsService = Depends(get_maps_service),
    _rate_limit: None = Depends(enforce_explore_rate_limit),
) -> WalkingRouteResponse:
    return service.get_walking_route(payload)
