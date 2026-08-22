from enum import StrEnum

from pydantic import BaseModel, Field, field_validator

# GeoPoint は core/geo.py へ昇格済み。既存 import (`from sanposcape.maps.schemas import
# GeoPoint`) を壊さないよう、ここでは再エクスポートのみ行う（クラス名は不変なので
# OpenAPI のコンポーネント名 `GeoPoint` にも変化はない）。
from sanposcape.core.geo import GeoPoint

__all__ = [
    "GeoPoint",
    "ExploreCategory",
    "PlaceSearchRequest",
    "PlaceCandidate",
    "PlaceSearchResponse",
    "WalkingRouteType",
    "WalkingRouteLegKind",
    "WalkingRouteLeg",
    "RouteDestination",
    "WalkingRouteRequest",
    "RouteDestinationRead",
    "MapBounds",
    "WalkingRouteResponse",
]


class ExploreCategory(StrEnum):
    CONVENIENCE_STORE = "convenience_store"
    SUPERMARKET = "supermarket"
    RETAIL = "retail"
    FACILITY = "facility"
    PARK = "park"
    STATION = "station"


class PlaceSearchRequest(BaseModel):
    origin: GeoPoint
    round_trip_duration_minutes: int = Field(ge=10, le=120, multiple_of=5)
    categories: list[ExploreCategory] = Field(min_length=1, max_length=6)
    limit: int = Field(default=20, ge=1, le=20)

    @field_validator("categories")
    @classmethod
    def _categories_must_be_unique(cls, categories: list[ExploreCategory]) -> list[ExploreCategory]:
        if len(set(categories)) != len(categories):
            raise ValueError("categories must not contain duplicates")
        return categories


class PlaceCandidate(BaseModel):
    id: str
    name: str = Field(
        min_length=1,
        description=(
            "Japanese-preferred display name supplied by the provider; falls back to another "
            "provider-available language when Japanese is unavailable."
        ),
    )
    category: ExploreCategory
    location: GeoPoint
    round_trip_duration_seconds: int = Field(ge=0)
    round_trip_distance_meters: int = Field(ge=0)


class PlaceSearchResponse(BaseModel):
    origin: GeoPoint
    round_trip_duration_minutes: int
    candidates: list[PlaceCandidate]


class WalkingRouteType(StrEnum):
    # SS-33: 提示するルートの形。既定は周回で、SS-35 の復路再計算が出発地への片道を明示する。
    # docstring は付けない: StrEnum の docstring は OpenAPI の description にそのまま出るため、
    # description は英語で書く方針(既存の PlaceCandidate.name に統一)に反してしまう。
    # 意味は WalkingRouteRequest.route_type の Field(description=...) 側に書く。
    LOOP = "loop"
    ONE_WAY = "one_way"


class WalkingRouteLegKind(StrEnum):
    # 周回ルートを構成する leg の種別。綴りは Orval / mobile 側の契約として固定する。
    OUTBOUND = "outbound"
    RETURN = "return"


class WalkingRouteLeg(BaseModel):
    kind: WalkingRouteLegKind
    duration_seconds: int = Field(ge=0)
    distance_meters: int = Field(ge=0)
    path: list[GeoPoint] = Field(min_length=2)


class RouteDestination(BaseModel):
    # SS-33: route_type によらず常に任意にする。place_id はルーティングに使っておらず必須にする
    # 技術的根拠が無く、条件付き必須にすると mobile 側の 422 リスクだけが増える
    # (backend-plan.md 決定 §8.3)。「出発地へ帰る」one_way リクエストは place_id を持たない。
    place_id: str | None = Field(default=None, min_length=1, max_length=256)
    location: GeoPoint
    # Optional compatibility field: SS-15 can preserve the name shown on the selected card
    # without a Place Details lookup. It is not an identifier or authorization input.
    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=256,
        description=(
            "Optional display metadata copied from the selected PlaceCandidate. "
            "It is echoed as destination.name and is not used for authorization."
        ),
    )


class WalkingRouteRequest(BaseModel):
    origin: GeoPoint
    destination: RouteDestination
    route_type: WalkingRouteType = Field(
        default=WalkingRouteType.LOOP,
        description=(
            "loop: origin -> destination -> a different path back to origin (the entire loop). "
            "one_way: origin -> destination only, e.g. recalculating the way back to the "
            "starting point while on the return leg (SS-35)."
        ),
    )


class RouteDestinationRead(RouteDestination):
    name: str


class MapBounds(BaseModel):
    north_east: GeoPoint
    south_west: GeoPoint


class WalkingRouteResponse(BaseModel):
    origin: GeoPoint
    destination: RouteDestinationRead
    # SS-33: mobile が投げた値をそのまま返す(未要求の追加フィールド)。origin/destination と同様、
    # レスポンス単体で意味が読めるようにする。mobile は無視してよい。
    route_type: WalkingRouteType
    duration_seconds: int = Field(
        ge=0,
        description=(
            "For route_type=loop, the duration of the entire loop (outbound + return legs "
            "summed). For route_type=one_way, the duration of that single leg."
        ),
    )
    distance_meters: int = Field(
        ge=0,
        description=(
            "For route_type=loop, the distance of the entire loop (outbound + return legs "
            "summed). For route_type=one_way, the distance of that single leg."
        ),
    )
    path: list[GeoPoint] = Field(
        min_length=2,
        description=(
            "For route_type=loop, the polyline of the entire loop: the outbound leg followed "
            "by the return leg, concatenated without duplicating the shared destination point. "
            "For route_type=one_way, the polyline of that single leg."
        ),
    )
    bounds: MapBounds = Field(
        description="Bounding box covering the entire loop (or the single leg for one_way)."
    )
    legs: list[WalkingRouteLeg] = Field(
        max_length=2,
        description=(
            "For route_type=loop, always exactly two legs ordered [outbound, return]. "
            "For route_type=one_way, an empty list."
        ),
    )
    return_is_same_path: bool = Field(
        description=(
            "True when a distinct return path could not be generated (or loop generation is "
            "disabled) and the response falls back to walking the outbound path in reverse. "
            "Always false for route_type=one_way."
        )
    )
