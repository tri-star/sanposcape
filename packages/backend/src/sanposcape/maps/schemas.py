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
    "RouteDestination",
    "WalkingRouteRequest",
    "RouteDestinationRead",
    "MapBounds",
    "WalkingRouteResponse",
    "WalkingRouteLegKind",
    "WalkingRouteLeg",
    "LoopWalkingRouteResponse",
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


class RouteDestination(BaseModel):
    place_id: str = Field(min_length=1, max_length=256)
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


class RouteDestinationRead(RouteDestination):
    name: str


class MapBounds(BaseModel):
    north_east: GeoPoint
    south_west: GeoPoint


class WalkingRouteResponse(BaseModel):
    origin: GeoPoint
    destination: RouteDestinationRead
    duration_seconds: int = Field(ge=0)
    distance_meters: int = Field(ge=0)
    path: list[GeoPoint] = Field(min_length=2)
    bounds: MapBounds


class WalkingRouteLegKind(StrEnum):
    OUTBOUND = "outbound"
    RETURN = "return"


class WalkingRouteLeg(BaseModel):
    kind: WalkingRouteLegKind
    duration_seconds: int = Field(ge=0)
    distance_meters: int = Field(ge=0)
    path: list[GeoPoint] = Field(min_length=2)


class LoopWalkingRouteResponse(BaseModel):
    """SS-33: 現在地 → 目的地 → (往路と異なる、または同じ) 道 → 現在地 の周回ルート。"""

    origin: GeoPoint
    destination: RouteDestinationRead
    duration_seconds: int = Field(
        ge=0, description="Sum of both legs' duration_seconds (the whole loop, not one-way)."
    )
    distance_meters: int = Field(
        ge=0, description="Sum of both legs' distance_meters (the whole loop, not one-way)."
    )
    legs: list[WalkingRouteLeg] = Field(
        min_length=2,
        max_length=2,
        description=(
            "Always exactly 2 legs, ordered [outbound, return]. When return_is_same_path is "
            "true, the return leg's path is the outbound leg's path reversed, and its "
            "duration/distance equal the outbound leg's."
        ),
    )
    return_is_same_path: bool = Field(
        description=(
            "True when no distinct return route could be produced (e.g. origin and "
            "destination are too close, or every candidate route failed validation) and the "
            "server falls back to retracing the outbound route."
        )
    )
    bounds: MapBounds = Field(
        description="Covers both legs' paths as well as origin and destination."
    )
