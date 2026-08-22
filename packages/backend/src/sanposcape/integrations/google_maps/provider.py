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
class ProviderIntermediate:
    """`computeRoutes` の `intermediates` 1件を表す。

    `via=True` は「通過するだけで leg を分割しない」経由点(SS-33 の周回用の復路
    経由点)。`via=False` は stopover で、そこで leg が分割される(周回の目的地)。
    """

    point: ProviderPoint
    via: bool


@dataclass(frozen=True)
class ProviderRouteLeg:
    duration_seconds: int
    distance_meters: int
    path: tuple[ProviderPoint, ...]


@dataclass(frozen=True)
class ProviderRoute:
    duration_seconds: int
    distance_meters: int
    path: tuple[ProviderPoint, ...]
    # SS-33: `intermediates` ありのリクエストでのみ埋まる(往路/復路の2件)。
    # 位置引数で組んでいる既存テストダブルを壊さないよう既定値を持たせる(決定2)。
    legs: tuple[ProviderRouteLeg, ...] = ()


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
        self,
        origin: ProviderPoint,
        destination: ProviderPoint,
        *,
        timeout_seconds: float,
        intermediates: tuple[ProviderIntermediate, ...] = (),
    ) -> ProviderRoute: ...
