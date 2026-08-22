import logging
from time import monotonic

from sanposcape.integrations.google_maps.exceptions import (
    GoogleMapsQuotaError,
    GoogleMapsUnavailableError,
)
from sanposcape.integrations.google_maps.provider import (
    GoogleMapsProvider,
    ProviderIntermediate,
    ProviderPoint,
    ProviderRoute,
    ProviderRouteLeg,
)
from sanposcape.maps.exceptions import MapsQuotaError, MapsUnavailableError
from sanposcape.maps.geometry import evaluate_loop, loop_waypoint_candidates
from sanposcape.maps.schemas import (
    GeoPoint,
    MapBounds,
    PlaceCandidate,
    PlaceSearchRequest,
    PlaceSearchResponse,
    RouteDestinationRead,
    WalkingRouteLeg,
    WalkingRouteLegKind,
    WalkingRouteRequest,
    WalkingRouteResponse,
    WalkingRouteType,
)

logger = logging.getLogger(__name__)


class MapsService:
    def __init__(
        self,
        provider: GoogleMapsProvider,
        max_place_candidates: int,
        max_route_requests: int,
        search_deadline_seconds: float,
        route_timeout_seconds: float,
        *,
        # SS-33: 既存テストが位置引数で MapsService を組んでいるため(backend-plan.md
        # 注意事項#7)、新しい引数はすべてキーワード専用 + 既定値ありにする。
        loop_enabled: bool = True,
        loop_duration_factor: float = 1.15,
        route_deadline_seconds: float = 12.0,
    ) -> None:
        self._provider = provider
        self._max_place_candidates = max_place_candidates
        self._max_route_requests = max_route_requests
        self._search_deadline_seconds = search_deadline_seconds
        self._route_timeout_seconds = route_timeout_seconds
        self._loop_enabled = loop_enabled
        self._loop_duration_factor = loop_duration_factor
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
            limited_places = places[:candidate_limit]
            for index, place in enumerate(limited_places):
                remaining_seconds = deadline - monotonic()
                if remaining_seconds <= 0:
                    break
                try:
                    route = self._provider.get_walking_route(
                        origin, place.location, timeout_seconds=remaining_seconds
                    )
                except GoogleMapsUnavailableError:
                    # 既存バグ修正(SS-14由来、SS-33目視確認で発見): 起点とほぼ同一地点の
                    # 候補(例: 起点=駅の目の前で station を検索すると、その駅自身が候補に
                    # 入り経路が1点に退化する。_load_route の min_length チェック参照)や、
                    # 個別のタイムアウト・5xxはこの候補1件の失敗として扱い、探索全体は
                    # 継続する。ここで拾わない GoogleMapsQuotaError(429)は外側の except で
                    # 探索全体を打ち切る(クォータ逼迫時に残り候補を叩き続けるのは有害)。
                    # なお全体の探索デッドライン超過は、この try に入る前の
                    # `remaining_seconds <= 0` チェックで既にループを打ち切っているため、
                    # ここでの continue は次周のその判定に委ねられ、無関係な候補への
                    # 余計な呼び出しは発生しない。
                    logger.warning(
                        "MapsService.search_places: candidate %d/%d skipped (route unavailable)",
                        index + 1,
                        len(limited_places),
                    )
                    continue
                # SS-33: 片道×2は周回に対して構造的な過小評価になるため、実測係数
                # (LOOP_FACTOR)で補正する(決定8)。ルートは片道のまま1回しか引かない。
                duration = round(route.duration_seconds * 2 * self._loop_duration_factor)
                distance = round(route.distance_meters * 2 * self._loop_duration_factor)
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
            if request.route_type is WalkingRouteType.ONE_WAY:
                route = self._provider.get_walking_route(
                    origin, destination, timeout_seconds=self._route_timeout_seconds
                )
                outbound_leg = self._leg_from_route(route)
                return self._one_way_response(request, outbound_leg)
            outbound_leg, inbound_leg, return_is_same_path = self._resolve_loop(origin, destination)
            return self._loop_response(request, outbound_leg, inbound_leg, return_is_same_path)
        except GoogleMapsQuotaError as exc:
            raise MapsQuotaError() from exc
        except GoogleMapsUnavailableError as exc:
            raise MapsUnavailableError() from exc

    def _resolve_loop(
        self, origin: ProviderPoint, destination: ProviderPoint
    ) -> tuple[ProviderRouteLeg, ProviderRouteLeg, bool]:
        """周回の往路/復路 leg を決める。

        戻り値は `(outbound, inbound, return_is_same_path)`。品質基準(`evaluate_loop`)を
        満たす周回が作れた場合は `return_is_same_path=False`。kill switch が OFF、
        経由点の生成余地がない(O≒D)、両経由点とも品質基準に届かない、のいずれかの場合は
        決定6のフォールバック(追加の Google 呼び出しをしない、往路を逆順にした復路)を返す。
        """
        if not self._loop_enabled:
            route = self._provider.get_walking_route(
                origin, destination, timeout_seconds=self._route_timeout_seconds
            )
            outbound_leg = self._leg_from_route(route)
            return outbound_leg, self._mirror_leg(outbound_leg), True

        deadline = monotonic() + self._route_deadline_seconds
        candidates = loop_waypoint_candidates(origin, destination)
        best_outbound_leg: ProviderRouteLeg | None = None

        for index, waypoint in enumerate(candidates):
            remaining = deadline - monotonic()
            if remaining <= 0:
                break
            # 決定9: 2回目の開始時点で残りが route_timeout_seconds の半分を切っていたら
            # 再試行しない(フォールバックへ)。
            if index > 0 and remaining < self._route_timeout_seconds / 2:
                break
            try:
                # SS-33 (A-2): GoogleMapsQuotaError は GoogleMapsUnavailableError の
                # 兄弟例外であり、意図的にここで捕捉しない。1回目の試行が成功したが
                # 品質不採用で best_outbound_leg を保持している状態で、2回目以降に
                # クォータエラーが出た場合も、その保持済みの往路 leg は使わずに即座に
                # 429 (MapsQuotaError) へ伝播させる。クォータ逼迫時に反対側の経由点へ
                # もう1回リクエストして状況を悪化させないための判断で、1回目で
                # クォータエラーが出るケース(handover-notes.md #31)だけでなく、
                # この「1回目成功・品質不採用 → 2回目でクォータエラー」という中間ケース
                # にも同じ理由で適用される(local-review.md A-2)。
                route = self._provider.get_walking_route(
                    origin,
                    origin,
                    timeout_seconds=min(self._route_timeout_seconds, remaining),
                    intermediates=(
                        ProviderIntermediate(point=destination, via=False),
                        ProviderIntermediate(point=waypoint, via=True),
                    ),
                )
            except GoogleMapsUnavailableError:
                # タイムアウト・5xx・「200 + routes 空」のいずれも、この試行の失敗として
                # 扱い次の候補へ進む(決定6: 周回が作れないことをエラーにしない)。
                logger.info("SS-33 loop attempt %d: no usable response", index)
                continue
            if not route.legs:
                continue
            best_outbound_leg = route.legs[0]
            if len(route.legs) != 2:
                # 復路 leg が壊れている(2点未満)。往路はフォールバック用に保持しつつ、
                # 品質評価はできないので次の候補へ。
                continue
            verdict = evaluate_loop(route.legs[0], route.legs[1])
            logger.info(
                "SS-33 loop attempt %d: accepted=%s reason=%s "
                "ret_ratio=%.3f total_ratio=%.3f overlap=%.3f",
                index,
                verdict.accepted,
                verdict.reason,
                verdict.return_to_outbound_ratio,
                verdict.total_to_straight_ratio,
                verdict.path_overlap_ratio,
            )
            if verdict.accepted:
                return route.legs[0], route.legs[1], False

        if best_outbound_leg is not None:
            return best_outbound_leg, self._mirror_leg(best_outbound_leg), True

        # ここまでで1回も使える応答が得られていない(候補が無かった、または全候補が例外/空
        # だった)。追加の Google 呼び出しにはなるが、intermediates なしの素の片道呼び出しに
        # 最後のフォールバックとして落とす(決定6)。多くの場合 /explore/places が同じ
        # (origin, destination) を既にキャッシュに載せているため、実際には Google に出ない。
        remaining = deadline - monotonic()
        if remaining <= 0:
            raise GoogleMapsUnavailableError()
        route = self._provider.get_walking_route(
            origin, destination, timeout_seconds=min(self._route_timeout_seconds, remaining)
        )
        outbound_leg = self._leg_from_route(route)
        return outbound_leg, self._mirror_leg(outbound_leg), True

    def _one_way_response(
        self, request: WalkingRouteRequest, outbound_leg: ProviderRouteLeg
    ) -> WalkingRouteResponse:
        path = [self._geo_point(point) for point in outbound_leg.path]
        return WalkingRouteResponse(
            origin=request.origin,
            destination=self._destination_read(request),
            route_type=WalkingRouteType.ONE_WAY,
            duration_seconds=outbound_leg.duration_seconds,
            distance_meters=outbound_leg.distance_meters,
            path=path,
            bounds=self._bounds(path),
            legs=[],
            return_is_same_path=False,
        )

    def _loop_response(
        self,
        request: WalkingRouteRequest,
        outbound_leg: ProviderRouteLeg,
        inbound_leg: ProviderRouteLeg,
        return_is_same_path: bool,
    ) -> WalkingRouteResponse:
        outbound_path = [self._geo_point(point) for point in outbound_leg.path]
        inbound_path = [self._geo_point(point) for point in inbound_leg.path]
        # 全体 path は往路→復路の連結。接合点(往路の終点=目的地=復路の始点)は重複させない
        # (mobile 要求 §8.4「接合点を重複させない」/ 決定3)。
        combined_path = outbound_path + inbound_path[1:]
        return WalkingRouteResponse(
            origin=request.origin,
            destination=self._destination_read(request),
            route_type=WalkingRouteType.LOOP,
            # Σlegs を採用する(決定3)。routes.duration をそのまま使うと leg ごとの
            # 秒への切り捨てで最大2秒ずれるため。
            duration_seconds=outbound_leg.duration_seconds + inbound_leg.duration_seconds,
            distance_meters=outbound_leg.distance_meters + inbound_leg.distance_meters,
            path=combined_path,
            bounds=self._bounds(combined_path),
            legs=[
                WalkingRouteLeg(
                    kind=WalkingRouteLegKind.OUTBOUND,
                    duration_seconds=outbound_leg.duration_seconds,
                    distance_meters=outbound_leg.distance_meters,
                    path=outbound_path,
                ),
                WalkingRouteLeg(
                    kind=WalkingRouteLegKind.RETURN,
                    duration_seconds=inbound_leg.duration_seconds,
                    distance_meters=inbound_leg.distance_meters,
                    path=inbound_path,
                ),
            ],
            return_is_same_path=return_is_same_path,
        )

    @staticmethod
    def _destination_read(request: WalkingRouteRequest) -> RouteDestinationRead:
        # SS-33: place_id が任意化されたため、name も place_id も無いリクエスト(one_way で
        # 出発地へ帰る場合)は空文字を返す。backend は表示文言を発明しない(決定15)。
        return RouteDestinationRead(
            place_id=request.destination.place_id,
            location=request.destination.location,
            name=request.destination.name or request.destination.place_id or "",
        )

    @staticmethod
    def _bounds(path: list[GeoPoint]) -> MapBounds:
        return MapBounds(
            north_east=GeoPoint(
                latitude=max(point.latitude for point in path),
                longitude=max(point.longitude for point in path),
            ),
            south_west=GeoPoint(
                latitude=min(point.latitude for point in path),
                longitude=min(point.longitude for point in path),
            ),
        )

    @staticmethod
    def _leg_from_route(route: ProviderRoute) -> ProviderRouteLeg:
        return ProviderRouteLeg(
            duration_seconds=route.duration_seconds,
            distance_meters=route.distance_meters,
            path=route.path,
        )

    @staticmethod
    def _mirror_leg(leg: ProviderRouteLeg) -> ProviderRouteLeg:
        """決定6のフォールバック: 往路を逆順にたどる復路を合成する(追加の Google 呼び出しなし)。"""
        return ProviderRouteLeg(
            duration_seconds=leg.duration_seconds,
            distance_meters=leg.distance_meters,
            path=tuple(reversed(leg.path)),
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
