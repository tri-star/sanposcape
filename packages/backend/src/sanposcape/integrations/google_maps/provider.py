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
