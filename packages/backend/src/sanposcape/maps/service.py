import logging
from concurrent.futures import ThreadPoolExecutor
from time import monotonic

from sanposcape.integrations.google_maps.exceptions import (
    GoogleMapsQuotaError,
    GoogleMapsUnavailableError,
)
from sanposcape.integrations.google_maps.provider import (
    GoogleMapsProvider,
    ProviderLoopRoute,
    ProviderPoint,
    ProviderRoute,
)
from sanposcape.maps.exceptions import MapsQuotaError, MapsUnavailableError
from sanposcape.maps.loop_route import (
    LoopEvaluation,
    LoopSide,
    evaluate_loop,
    loop_waypoint_candidates,
    select_loop,
)
from sanposcape.maps.schemas import (
    GeoPoint,
    LoopWalkingRouteResponse,
    MapBounds,
    PlaceCandidate,
    PlaceSearchRequest,
    PlaceSearchResponse,
    RouteDestinationRead,
    WalkingRouteLeg,
    WalkingRouteLegKind,
    WalkingRouteRequest,
    WalkingRouteResponse,
)

logger = logging.getLogger(__name__)

# 周回を並列取得する候補は常に2つ（右・左）に固定されている（maps/loop_route.py）。
_LOOP_CANDIDATE_WORKERS = 2

_LoopOutcome = ProviderLoopRoute | GoogleMapsQuotaError | GoogleMapsUnavailableError


class MapsService:
    def __init__(
        self,
        provider: GoogleMapsProvider,
        max_place_candidates: int,
        max_route_requests: int,
        search_deadline_seconds: float,
        route_timeout_seconds: float,
        *,
        loop_route_enabled: bool = True,
        route_deadline_seconds: float = 12.0,
    ) -> None:
        self._provider = provider
        self._max_place_candidates = max_place_candidates
        self._max_route_requests = max_route_requests
        self._search_deadline_seconds = search_deadline_seconds
        self._route_timeout_seconds = route_timeout_seconds
        self._loop_route_enabled = loop_route_enabled
        self._route_deadline_seconds = route_deadline_seconds

    def search_places(self, request: PlaceSearchRequest) -> PlaceSearchResponse:
        origin = self._provider_point(request.origin)
        categories = tuple(sorted(category.value for category in request.categories))
        candidate_limit = min(request.limit, self._max_place_candidates, self._max_route_requests)
        deadline = monotonic() + self._search_deadline_seconds
        try:
            places = self._provider.search_places(
                origin,
                categories,
                candidate_limit,
                timeout_seconds=self._remaining_seconds(deadline),
            )
            candidates: list[PlaceCandidate] = []
            maximum_seconds = request.round_trip_duration_minutes * 60
            for place in places[:candidate_limit]:
                remaining_seconds = deadline - monotonic()
                if remaining_seconds <= 0:
                    break
                route = self._provider.get_walking_route(
                    origin, place.location, timeout_seconds=remaining_seconds
                )
                duration = route.duration_seconds * 2
                distance = route.distance_meters * 2
                if duration <= maximum_seconds:
                    candidates.append(
                        PlaceCandidate(
                            id=place.id,
                            name=place.name,
                            category=place.category,
                            location=self._geo_point(place.location),
                            round_trip_duration_seconds=duration,
                            round_trip_distance_meters=distance,
                        )
                    )
        except GoogleMapsQuotaError as exc:
            raise MapsQuotaError() from exc
        except GoogleMapsUnavailableError as exc:
            raise MapsUnavailableError() from exc
        candidates.sort(
            key=lambda candidate: (
                candidate.round_trip_duration_seconds,
                candidate.round_trip_distance_meters,
            )
        )
        return PlaceSearchResponse(
            origin=request.origin,
            round_trip_duration_minutes=request.round_trip_duration_minutes,
            candidates=candidates,
        )

    def get_walking_route(self, request: WalkingRouteRequest) -> WalkingRouteResponse:
        origin = self._provider_point(request.origin)
        destination = self._provider_point(request.destination.location)
        try:
            route = self._provider.get_walking_route(
                origin, destination, timeout_seconds=self._route_timeout_seconds
            )
        except GoogleMapsQuotaError as exc:
            raise MapsQuotaError() from exc
        except GoogleMapsUnavailableError as exc:
            raise MapsUnavailableError() from exc
        path = [self._geo_point(point) for point in route.path]
        return WalkingRouteResponse(
            origin=request.origin,
            destination=self._destination_read(request),
            duration_seconds=route.duration_seconds,
            distance_meters=route.distance_meters,
            path=path,
            bounds=self._bounds(path),
        )

    def get_loop_walking_route(self, request: WalkingRouteRequest) -> LoopWalkingRouteResponse:
        """SS-33: 現在地 → 目的地 → (往路と異なる道) → 現在地 の周回ルートを返す。

        ADR-007 決定5のフローをそのまま実装する。周回を作れない／候補がすべて
        不合格のときも例外にせず、200 + `return_is_same_path=True`（同じ道で戻る）で返す。
        """
        origin = self._provider_point(request.origin)
        destination = self._provider_point(request.destination.location)
        destination_read = self._destination_read(request)

        if not self._loop_route_enabled:
            logger.info("Loop route disabled by kill switch; falling back to same-path.")
            return self._same_path_response(request, origin, destination, destination_read)

        candidates = loop_waypoint_candidates(origin, destination)
        if not candidates:
            logger.info("Origin/destination too close for a loop; falling back to same-path.")
            return self._same_path_response(request, origin, destination, destination_read)

        deadline = monotonic() + self._route_deadline_seconds
        per_candidate_timeout = min(self._route_timeout_seconds, self._route_deadline_seconds)

        outcomes: dict[LoopSide, _LoopOutcome] = {}
        with ThreadPoolExecutor(max_workers=_LOOP_CANDIDATE_WORKERS) as executor:
            future_to_candidate = {
                executor.submit(
                    self._provider.get_walking_loop_route,
                    origin,
                    destination,
                    candidate.via,
                    timeout_seconds=per_candidate_timeout,
                ): candidate
                for candidate in candidates
            }
            for future, candidate in future_to_candidate.items():
                try:
                    outcomes[candidate.side] = future.result()
                except GoogleMapsQuotaError as exc:
                    outcomes[candidate.side] = exc
                    # 他方が成功しても、この側のクォータ超過は最終ログに埋もれず必ず1行残す
                    # （決定5: 片方成功時にクォータの予兆が運用ログから見えなくなるのを防ぐ）。
                    logger.warning("Loop route candidate quota exceeded: side=%s", candidate.side)
                except GoogleMapsUnavailableError as exc:
                    outcomes[candidate.side] = exc
                    logger.info("Loop route candidate unavailable: side=%s", candidate.side)

        evaluations: list[LoopEvaluation] = []
        first_success: ProviderLoopRoute | None = None
        any_quota = False
        for candidate in candidates:  # right → left の順を維持する（同点タイブレークのため）
            outcome = outcomes.get(candidate.side)
            if isinstance(outcome, GoogleMapsQuotaError):
                any_quota = True
                continue
            if isinstance(outcome, GoogleMapsUnavailableError):
                continue
            if outcome is None:
                continue
            if first_success is None:
                first_success = outcome
            verdict = evaluate_loop(
                outcome.outbound, outcome.inbound, candidate.via, origin, destination
            )
            evaluations.append(
                LoopEvaluation(
                    side=candidate.side,
                    via=candidate.via,
                    outbound=outcome.outbound,
                    inbound=outcome.inbound,
                    verdict=verdict,
                )
            )
            logger.info(
                "Loop route candidate evaluated: side=%s accepted=%s reason=%s detour_ratio=%.3f "
                "return_overlap_ratio=%.3f return_backtrack_ratio=%.3f "
                "via_snap_distance_meters=%.1f",
                candidate.side,
                verdict.accepted,
                verdict.reason,
                verdict.detour_ratio,
                verdict.return_overlap_ratio,
                verdict.return_backtrack_ratio,
                verdict.via_snap_distance_meters,
            )

        selected = select_loop(tuple(evaluations))
        if selected is not None:
            logger.info("Loop route result: selected_side=%s outcome=accepted", selected.side)
            return self._loop_response(
                request,
                destination_read,
                selected.outbound,
                selected.inbound,
                return_is_same_path=False,
            )

        if first_success is not None:
            logger.info(
                "Loop route result: outcome=fallback_same_path_from_candidate evaluated=%d",
                len(evaluations),
            )
            return self._loop_response(
                request,
                destination_read,
                first_success.outbound,
                self._mirror(first_success.outbound),
                return_is_same_path=True,
            )

        if any_quota:
            logger.warning("Loop route result: outcome=quota")
            raise MapsQuotaError()

        remaining = deadline - monotonic()
        if remaining <= 0:
            logger.warning("Loop route result: outcome=deadline_expired")
            raise MapsUnavailableError()

        logger.info("Loop route result: outcome=fallback_same_path_single_fetch")
        try:
            route = self._provider.get_walking_route(origin, destination, timeout_seconds=remaining)
        except GoogleMapsQuotaError as exc:
            raise MapsQuotaError() from exc
        except GoogleMapsUnavailableError as exc:
            raise MapsUnavailableError() from exc
        return self._loop_response(
            request, destination_read, route, self._mirror(route), return_is_same_path=True
        )

    def _same_path_response(
        self,
        request: WalkingRouteRequest,
        origin: ProviderPoint,
        destination: ProviderPoint,
        destination_read: RouteDestinationRead,
    ) -> LoopWalkingRouteResponse:
        try:
            route = self._provider.get_walking_route(
                origin, destination, timeout_seconds=self._route_timeout_seconds
            )
        except GoogleMapsQuotaError as exc:
            raise MapsQuotaError() from exc
        except GoogleMapsUnavailableError as exc:
            raise MapsUnavailableError() from exc
        return self._loop_response(
            request, destination_read, route, self._mirror(route), return_is_same_path=True
        )

    def _loop_response(
        self,
        request: WalkingRouteRequest,
        destination_read: RouteDestinationRead,
        outbound: ProviderRoute,
        inbound: ProviderRoute,
        *,
        return_is_same_path: bool,
    ) -> LoopWalkingRouteResponse:
        legs = [
            self._leg(WalkingRouteLegKind.OUTBOUND, outbound),
            self._leg(WalkingRouteLegKind.RETURN, inbound),
        ]
        bounds_points = (
            [self._geo_point(point) for point in outbound.path]
            + [self._geo_point(point) for point in inbound.path]
            + [request.origin, request.destination.location]
        )
        return LoopWalkingRouteResponse(
            origin=request.origin,
            destination=destination_read,
            duration_seconds=outbound.duration_seconds + inbound.duration_seconds,
            distance_meters=outbound.distance_meters + inbound.distance_meters,
            legs=legs,
            return_is_same_path=return_is_same_path,
            bounds=self._bounds(bounds_points),
        )

    @staticmethod
    def _mirror(route: ProviderRoute) -> ProviderRoute:
        """`route` を逆順にたどっただけの複製を返す（同じ道フォールバック用）。"""
        return ProviderRoute(
            duration_seconds=route.duration_seconds,
            distance_meters=route.distance_meters,
            path=tuple(reversed(route.path)),
        )

    @staticmethod
    def _leg(kind: WalkingRouteLegKind, route: ProviderRoute) -> WalkingRouteLeg:
        return WalkingRouteLeg(
            kind=kind,
            duration_seconds=route.duration_seconds,
            distance_meters=route.distance_meters,
            path=[MapsService._geo_point(point) for point in route.path],
        )

    @staticmethod
    def _destination_read(request: WalkingRouteRequest) -> RouteDestinationRead:
        # Place search remains the authoritative source of a display name. Routes does not
        # make a Place Details request merely to enrich this response.
        return RouteDestinationRead(
            place_id=request.destination.place_id,
            location=request.destination.location,
            name=request.destination.name or request.destination.place_id,
        )

    @staticmethod
    def _bounds(points: list[GeoPoint]) -> MapBounds:
        return MapBounds(
            north_east=GeoPoint(
                latitude=max(point.latitude for point in points),
                longitude=max(point.longitude for point in points),
            ),
            south_west=GeoPoint(
                latitude=min(point.latitude for point in points),
                longitude=min(point.longitude for point in points),
            ),
        )

    @staticmethod
    def _provider_point(point: GeoPoint) -> ProviderPoint:
        return ProviderPoint(latitude=point.latitude, longitude=point.longitude)

    @staticmethod
    def _geo_point(point: ProviderPoint) -> GeoPoint:
        return GeoPoint(latitude=point.latitude, longitude=point.longitude)

    @staticmethod
    def _remaining_seconds(deadline: float) -> float:
        remaining_seconds = deadline - monotonic()
        if remaining_seconds <= 0:
            raise GoogleMapsUnavailableError()
        return remaining_seconds
