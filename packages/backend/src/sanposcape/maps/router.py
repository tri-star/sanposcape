from fastapi import APIRouter, Depends

from sanposcape.maps.dependencies import enforce_explore_rate_limit, get_maps_service
from sanposcape.maps.schemas import (
    LoopWalkingRouteResponse,
    PlaceSearchRequest,
    PlaceSearchResponse,
    WalkingRouteRequest,
    WalkingRouteResponse,
)
from sanposcape.maps.service import MapsService

router = APIRouter(prefix="/explore", tags=["explore"])

_ERROR_RESPONSES = {
    401: {"description": "Not authenticated"},
    413: {"description": "Explore request body too large"},
    429: {"description": "Map provider quota exceeded or explore rate limit reached"},
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
    deprecated=True,
)
def get_walking_route(
    payload: WalkingRouteRequest,
    service: MapsService = Depends(get_maps_service),
    _rate_limit: None = Depends(enforce_explore_rate_limit),
) -> WalkingRouteResponse:
    """SS-33: `/explore/routes/loop` に置き換え。配布済みビルドの互換のため維持する
    （意味・スキーマは変えない。片道の duration_seconds/distance_meters のまま）。"""
    return service.get_walking_route(payload)


@router.post(
    "/routes/loop",
    response_model=LoopWalkingRouteResponse,
    operation_id="get_loop_walking_route_explore_routes_loop",
    responses=_ERROR_RESPONSES,
)
def get_loop_walking_route(
    payload: WalkingRouteRequest,
    service: MapsService = Depends(get_maps_service),
    _rate_limit: None = Depends(enforce_explore_rate_limit),
) -> LoopWalkingRouteResponse:
    """SS-33: 現在地 → 目的地 → (往路と異なる道) → 現在地 の周回ルート。

    周回を作れない場合も 200 + `return_is_same_path=true`（同じ道で戻る）で返す
    （エラーにしない）。
    """
    return service.get_loop_walking_route(payload)
