from enum import StrEnum

from pydantic import BaseModel, Field, field_validator, model_validator

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
    "ReverseGeocodeRequest",
    "ReverseGeocodeResponse",
    "NearestStationRequest",
    "NearestStationRead",
    "NearestStationResponse",
    "PlaceTextSearchRequest",
    "PlaceTextSearchScope",
    "PlaceTextSearchResult",
    "PlaceTextSearchResponse",
]

# 検索語の上限（code point。前後の空白を除いた後）。住所・施設名の入力には十分な長さ。
PLACE_TEXT_QUERY_MAX_LENGTH = 100


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


class ReverseGeocodeRequest(BaseModel):
    """ピンの位置の住所を引く（SS-138。SS-212 からはピン詳細の表示に使う）。"""

    location: GeoPoint


class ReverseGeocodeResponse(BaseModel):
    """SS-138: 住所が見つからない場所では 200 で `address=null` を返す（エラーにしない）。"""

    address: str | None = Field(
        max_length=256,
        description=(
            "Japanese-preferred address of the location without the country name and postal "
            "code, with full-width digits and symbols normalized to half-width "
            "(e.g. '東京都千代田区丸の内1丁目9-1'). Null when no address is available."
        ),
    )
    building_name: str | None = Field(
        max_length=256,
        description=(
            "Building name at the location when the provider supplies one (best-effort). "
            "Taken only from a provider result whose bounds contain the location. "
            "Not included in address. Null when unavailable or when address is null."
        ),
    )


class NearestStationRequest(BaseModel):
    """ピンの位置の最寄り駅を引く（SS-225。ピンの登録画面でタグを最初から入れておくのに使う）。"""

    location: GeoPoint


class NearestStationRead(BaseModel):
    name: str = Field(
        max_length=64,
        description="Station name as in the bundled dataset (e.g. '新宿'), without '駅'.",
    )
    tag_label: str = Field(
        max_length=20,
        description=(
            "Pin tag label for the station: the name without a trailing parenthetical, "
            "suffixed with '駅' unless it already ends with it (e.g. '新宿駅')."
        ),
    )
    distance_meters: int = Field(ge=0, description="Straight-line distance from the location.")


class NearestStationResponse(BaseModel):
    """SS-225: 3km 以内に駅が無い、またはタグにできない駅名のときは 200 で `station=null`。"""

    station: NearestStationRead | None


class PlaceTextSearchRequest(BaseModel):
    """ピンタブの検索（SS-267）。地名・住所・駅・施設の種類（「コンビニ」など）を文字列で探す。"""

    query: str = Field(
        min_length=1,
        max_length=PLACE_TEXT_QUERY_MAX_LENGTH,
        description=(
            "Free-text query such as an address, a station name or a kind of place. "
            "Leading and trailing whitespace is removed; must be 1-100 characters after that."
        ),
    )
    bounds: MapBounds = Field(
        description=(
            "The map area currently shown. The server first searches only inside it, and "
            "searches once more around its center when nothing is found."
        )
    )

    @field_validator("query", mode="before")
    @classmethod
    def _strip_query(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @model_validator(mode="after")
    def _bounds_must_be_ordered(self) -> "PlaceTextSearchRequest":
        # 日付変更線をまたぐ範囲（west > east）は扱わない（日本の地図では起きない）。
        north_east, south_west = self.bounds.north_east, self.bounds.south_west
        if south_west.latitude > north_east.latitude or south_west.longitude > north_east.longitude:
            raise ValueError("bounds.south_west must be south-west of bounds.north_east")
        return self


class PlaceTextSearchScope(StrEnum):
    VISIBLE_AREA = "visible_area"
    EXPANDED = "expanded"


class PlaceTextSearchResult(BaseModel):
    id: str = Field(description="Provider place ID.")
    name: str = Field(
        min_length=1,
        max_length=256,
        description="Japanese-preferred display name supplied by the provider.",
    )
    address: str | None = Field(
        max_length=256,
        description=(
            "Address without the country name and postal code, with full-width digits and "
            "symbols normalized to half-width. Null when the provider has none."
        ),
    )
    location: GeoPoint


class PlaceTextSearchResponse(BaseModel):
    """SS-267: 見つからなければ 200 で `results=[]`（`scope` は広げて探した `expanded`）。"""

    results: list[PlaceTextSearchResult] = Field(
        max_length=20, description="In the provider's relevance order (not re-sorted)."
    )
    scope: PlaceTextSearchScope = Field(
        description=(
            "visible_area: found inside the requested bounds. expanded: nothing was found "
            "inside the bounds, so the server searched around their center without restricting "
            "to the bounds (results may lie outside them)."
        )
    )
