from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class ProviderPoint:
    latitude: float
    longitude: float


@dataclass(frozen=True)
class ProviderPlace:
    id: str
    name: str
    category: str
    location: ProviderPoint


@dataclass(frozen=True)
class ProviderRoute:
    duration_seconds: int
    distance_meters: int
    path: tuple[ProviderPoint, ...]


@dataclass(frozen=True)
class ProviderLoopRoute:
    """周回ルートの往路・復路 leg の組（SS-33）。

    往復1回の `computeRoutes`（`intermediates=[destination(stopover), via]`）から
    得られる2つの leg を、既存の `ProviderRoute` のまま再利用する。
    """

    outbound: ProviderRoute
    inbound: ProviderRoute


@dataclass(frozen=True)
class ProviderAddress:
    """逆ジオコーディングの結果（SS-138）。

    `address` は郵便番号と国名を落とし半角に揃えた住所（例: `東京都千代田区丸の内1丁目9-1`）。
    `building_name` は取れたときだけの建物名（Google の `premise` のうち番地ではないもの）。
    """

    address: str
    building_name: str | None


class GoogleMapsProvider(Protocol):
    def search_places(
        self,
        origin: ProviderPoint,
        categories: tuple[str, ...],
        limit: int,
        *,
        timeout_seconds: float,
    ) -> tuple[ProviderPlace, ...]: ...

    def get_walking_route(
        self, origin: ProviderPoint, destination: ProviderPoint, *, timeout_seconds: float
    ) -> ProviderRoute: ...

    def get_walking_loop_route(
        self,
        origin: ProviderPoint,
        destination: ProviderPoint,
        via: ProviderPoint,
        *,
        timeout_seconds: float,
    ) -> ProviderLoopRoute: ...

    def reverse_geocode(
        self, point: ProviderPoint, *, timeout_seconds: float
    ) -> ProviderAddress | None: ...
