"""Bounded walking loop search. All geometry is provider-supplied, never invented paths."""

from dataclasses import dataclass
from math import ceil, cos, hypot, radians
from time import monotonic

from sanposcape.integrations.google_maps.cache import TtlCache
from sanposcape.integrations.google_maps.provider import (
    GoogleMapsProvider,
    ProviderPoint,
    ProviderRoute,
)


class SearchExhausted(Exception):
    """The shared request count or elapsed-time budget was exhausted."""


@dataclass
class SearchBudget:
    remaining: int
    deadline: float

    def check(self) -> None:
        if monotonic() >= self.deadline:
            raise SearchExhausted()

    def take(self) -> float:
        self.check()
        seconds = self.deadline - monotonic()
        if self.remaining <= 0:
            raise SearchExhausted()
        self.remaining -= 1
        return seconds


@dataclass(frozen=True)
class RoundTrip:
    outbound: ProviderRoute
    returning: ProviderRoute


@dataclass
class PendingTrip:
    origin: ProviderPoint
    destination: ProviderPoint
    maximum_seconds: int
    outbound: ProviderRoute


# Local tangent plane with longitude wrapping, adequate for walking distances.
def xy(point: ProviderPoint, origin: ProviderPoint) -> tuple[float, float]:
    longitude = (point.longitude - origin.longitude + 180) % 360 - 180
    return (
        radians(longitude) * cos(radians(origin.latitude)) * 6371008.8,
        radians(point.latitude - origin.latitude) * 6371008.8,
    )


def distance(a: ProviderPoint, b: ProviderPoint) -> float:
    return hypot(*xy(a, b))


def segment_distance(
    p: tuple[float, float], a: tuple[float, float], b: tuple[float, float]
) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    length2 = dx * dx + dy * dy
    t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2)) if length2 else 0
    return hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def overlap(
    path: tuple[ProviderPoint, ...],
    other: tuple[ProviderPoint, ...],
    budget: SearchBudget | None = None,
) -> float:
    """Length-weighted proximity, independent of vertex density and travel direction."""
    reference = path[0]
    segments = list(
        zip([xy(p, reference) for p in other], [xy(p, reference) for p in other[1:]], strict=False)
    )
    shared = total = 0.0
    for start, end in zip(path, path[1:], strict=False):
        a, b = xy(start, reference), xy(end, reference)
        length = hypot(b[0] - a[0], b[1] - a[1])
        count = max(1, ceil(length / 10))
        for i in range(count):
            if budget is not None:
                budget.check()
            t = (i + 0.5) / count
            point = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
            if (
                min((segment_distance(point, x, y) for x, y in segments), default=float("inf"))
                <= 20
            ):
                shared += length / count
        total += length
    return shared / total if total else 1.0


class RoundTripPlanner:
    def __init__(self, provider: GoogleMapsProvider, ttl: int = 300, capacity: int = 256):
        self.provider = provider
        self.cache: TtlCache[RoundTrip] = TtlCache(ttl, capacity)

    @staticmethod
    def key(origin: ProviderPoint, destination: ProviderPoint, maximum: int) -> str:
        return repr(("loop-v1", origin, destination, maximum))

    def prepare(
        self, origin: ProviderPoint, destination: ProviderPoint, maximum: int, budget: SearchBudget
    ) -> RoundTrip | PendingTrip | None:
        budget.check()
        cached = self.cache.get(self.key(origin, destination, maximum))
        if cached is not None:
            return cached
        if distance(origin, destination) < 40:
            return None
        routes = self.provider.get_walking_routes(
            origin, destination, timeout_seconds=budget.take()
        )
        if not routes:
            return None
        outbound = routes[0]
        if (
            not self.connected(outbound, origin, destination)
            or outbound.duration_seconds >= maximum
        ):
            return None
        pending = PendingTrip(origin, destination, maximum, outbound)
        returning = self.provider.get_walking_routes(
            destination, origin, alternatives=True, timeout_seconds=budget.take()
        )
        return self.choose(pending, returning, budget) or pending

    def finish(self, pending: PendingTrip, budget: SearchBudget) -> RoundTrip | None:
        origin, destination = pending.origin, pending.destination
        dx, dy = xy(destination, origin)
        # Two opposite sides; no waypoint optimization that could undo the detour.
        longitude_delta = (destination.longitude - origin.longitude + 180) % 360 - 180
        for side in (1, -1):
            latitude = (origin.latitude + destination.latitude) / 2 + side * dx * 0.4 / 111195
            longitude = (
                origin.longitude
                + longitude_delta / 2
                - side * dy * 0.4 / (111195 * max(0.01, cos(radians(origin.latitude))))
            )
            waypoint = ProviderPoint(max(-89.9, min(89.9, latitude)), (longitude + 180) % 360 - 180)
            routes = self.provider.get_walking_routes(
                destination, origin, intermediates=(waypoint,), timeout_seconds=budget.take()
            )
            result = self.choose(pending, routes, budget)
            if result is not None:
                return result
        return None

    @staticmethod
    def connected(route: ProviderRoute, origin: ProviderPoint, destination: ProviderPoint) -> bool:
        return (
            len(route.path) >= 2
            and route.distance_meters > 0
            and route.duration_seconds > 0
            and distance(route.path[0], origin) <= 150
            and distance(route.path[-1], destination) <= 150
        )

    def choose(
        self,
        pending: PendingTrip,
        routes: tuple[ProviderRoute, ...],
        budget: SearchBudget | None = None,
    ) -> RoundTrip | None:
        if budget is not None:
            budget.check()
        outbound = pending.outbound
        scored = []
        for route in routes:
            if budget is not None:
                budget.check()
            if (
                not self.connected(route, pending.destination, pending.origin)
                or distance(outbound.path[-1], route.path[0]) > 30
                or distance(outbound.path[0], route.path[-1]) > 30
                or route.duration_seconds + outbound.duration_seconds > pending.maximum_seconds
                or route.distance_meters > 2 * outbound.distance_meters
            ):
                continue
            # Both directions prevent a tiny shortcut or long detour hiding shared pavement.
            shared = max(
                overlap(route.path, outbound.path, budget),
                overlap(outbound.path, route.path, budget),
            )
            if shared <= 0.5:
                scored.append((shared, route.duration_seconds, route.distance_meters, route))
        if not scored:
            return None
        route = min(scored, key=lambda entry: entry[:3])[3]
        if budget is not None:
            budget.check()
        trip = RoundTrip(outbound, route)
        self.cache.put(self.key(pending.origin, pending.destination, pending.maximum_seconds), trip)
        return trip
