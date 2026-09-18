from dataclasses import replace
from itertools import pairwise

import pytest

from sanposcape.integrations.google_maps.exceptions import (
    GoogleMapsQuotaError,
    GoogleMapsUnavailableError,
)
from sanposcape.integrations.google_maps.provider import (
    ProviderLoopRoute,
    ProviderPlace,
    ProviderPoint,
    ProviderRoute,
)
from sanposcape.maps.exceptions import MapsQuotaError, MapsUnavailableError
from sanposcape.maps.geometry import haversine_meters
from sanposcape.maps.loop_route import loop_waypoint_candidates
from sanposcape.maps.schemas import PlaceSearchRequest, WalkingRouteRequest
from sanposcape.maps.service import MapsService


class FakeProvider:
    """`GoogleMapsProvider` のローカルテストダブル。

    `integrations/google_maps/fake.py` の `FakeGoogleMapsProvider`（幾何計算で決定的な
    値を作る「公式」の fake）とは別物。こちらは `MapsService` のソート順・タイムアウト
    打ち切りロジックを検証するために、応答値（`duration_seconds` 等）を明示的に固定
    したいテスト専用のスタブで、`FakeGoogleMapsProvider` では代替できない。
    """

    def __init__(self) -> None:
        self.places = (
            ProviderPlace("far", "遠い公園", "park", ProviderPoint(35.1, 139.1)),
            ProviderPlace("near", "近い公園", "park", ProviderPoint(35.2, 139.2)),
        )
        self.routes = {
            (35.1, 139.1): ProviderRoute(
                400, 500, (ProviderPoint(35, 139), ProviderPoint(35.1, 139.1))
            ),
            (35.2, 139.2): ProviderRoute(
                200, 200, (ProviderPoint(35, 139), ProviderPoint(35.2, 139.2))
            ),
        }

    def search_places(self, origin, categories, limit, **kwargs):
        return self.places[:limit]

    def get_walking_route(self, origin, destination, **kwargs):
        return self.routes[(destination.latitude, destination.longitude)]


def test_search_filters_and_sorts_by_round_trip_then_distance() -> None:
    service = MapsService(FakeProvider(), 20, 20, 10, 8)
    result = service.search_places(
        PlaceSearchRequest.model_validate(
            {
                "origin": {"latitude": 35, "longitude": 139},
                "round_trip_duration_minutes": 10,
                "categories": ["park"],
            }
        )
    )
    assert [candidate.id for candidate in result.candidates] == ["near"]
    assert result.candidates[0].name == "近い公園"
    assert result.candidates[0].round_trip_duration_seconds == 400


def test_route_returns_map_ready_path_bounds_and_destination_name() -> None:
    service = MapsService(FakeProvider(), 20, 20, 10, 8)
    result = service.get_walking_route(
        WalkingRouteRequest.model_validate(
            {
                "origin": {"latitude": 35, "longitude": 139},
                "destination": {
                    "place_id": "near",
                    "name": "Near",
                    "location": {"latitude": 35.2, "longitude": 139.2},
                },
            }
        )
    )
    assert result.destination.name == "Near"
    assert len(result.path) == 2
    assert result.bounds.north_east == result.path[-1]


def test_search_stops_route_fan_out_when_end_to_end_deadline_expires(monkeypatch) -> None:
    provider = FakeProvider()
    service = MapsService(provider, 20, 20, 10, 8)
    times = iter((0.0, 0.0, 0.0, 11.0))
    monkeypatch.setattr("sanposcape.maps.service.monotonic", lambda: next(times))

    result = service.search_places(
        PlaceSearchRequest.model_validate(
            {
                "origin": {"latitude": 35, "longitude": 139},
                "round_trip_duration_minutes": 20,
                "categories": ["park"],
            }
        )
    )

    assert [candidate.id for candidate in result.candidates] == ["far"]


@pytest.mark.parametrize(
    "error, expected",
    [
        (GoogleMapsQuotaError(), MapsQuotaError),
        (GoogleMapsUnavailableError(), MapsUnavailableError),
    ],
)
def test_provider_failures_are_mapped(error, expected) -> None:
    class ErrorProvider(FakeProvider):
        def search_places(self, origin, categories, limit, **kwargs):
            raise error

    service = MapsService(ErrorProvider(), 20, 20, 10, 8)
    with pytest.raises(expected):
        service.search_places(
            PlaceSearchRequest.model_validate(
                {
                    "origin": {"latitude": 35, "longitude": 139},
                    "round_trip_duration_minutes": 10,
                    "categories": ["park"],
                }
            )
        )


# --- get_loop_walking_route (SS-33) ---

_LOOP_ORIGIN = ProviderPoint(35.0, 139.0)
_LOOP_DESTINATION = ProviderPoint(35.003, 139.0)  # ~333m north、周回の余地がある距離
_LOOP_RIGHT, _LOOP_LEFT = loop_waypoint_candidates(_LOOP_ORIGIN, _LOOP_DESTINATION)


class LoopFakeProvider:
    """`get_loop_walking_route` の並列取得・フォールバック分岐を検証するためのスタブ。

    候補は経由点（via、小数5桁）で見分ける（ADR-007 決定1・決定2）。
    """

    def __init__(
        self,
        *,
        loop_by_via: dict[tuple[float, float], object] | None = None,
        walking_route: ProviderRoute | None = None,
        walking_route_error: Exception | None = None,
    ) -> None:
        self._loop_by_via = loop_by_via or {}
        self._walking_route = walking_route
        self._walking_route_error = walking_route_error
        self.loop_call_count = 0
        self.walking_route_call_count = 0

    def search_places(self, *args, **kwargs):
        raise NotImplementedError

    def get_walking_route(self, origin, destination, **kwargs):
        self.walking_route_call_count += 1
        if self._walking_route_error is not None:
            raise self._walking_route_error
        return self._walking_route

    def get_walking_loop_route(self, origin, destination, via, **kwargs):
        self.loop_call_count += 1
        outcome = self._loop_by_via[_via_key(via)]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def _via_key(point: ProviderPoint) -> tuple[float, float]:
    return (round(point.latitude, 5), round(point.longitude, 5))


def _straight_route(*points: ProviderPoint) -> ProviderRoute:
    total = sum(haversine_meters(a, b) for a, b in pairwise(points))
    return ProviderRoute(
        duration_seconds=round(total / 1.25), distance_meters=round(total), path=tuple(points)
    )


def _loop_route(
    origin: ProviderPoint,
    destination: ProviderPoint,
    via: ProviderPoint,
    *,
    detour_ratio: float = 1.05,
    accepted: bool = True,
) -> ProviderLoopRoute:
    """destination→via→origin の直線復路を持つ `ProviderLoopRoute` を作る。

    via はデフォルトで `MIN_WAYPOINT_OFFSET_METERS` 以上 O-D 線から離れているため、
    このまま作ると重複率・折り返し率・スナップ距離はいずれも合格側に振れる
    （`maps/tests/test_loop_route.py` の「平行に60m離れた復路」と同じ考え方）。
    そのため `accepted`/`detour_ratio` は復路の所要時間だけを操作して制御する。
    """
    outbound = _straight_route(origin, destination)
    inbound = _straight_route(destination, via, origin)
    # 不合格側は明確にしきい値(1.4)を超えさせる。
    target_ratio = detour_ratio if accepted else 10.0
    target_duration = round(
        outbound.duration_seconds * 2 * target_ratio - outbound.duration_seconds
    )
    return ProviderLoopRoute(
        outbound=outbound, inbound=replace(inbound, duration_seconds=max(target_duration, 0))
    )


def _loop_request(
    origin: ProviderPoint = _LOOP_ORIGIN, destination: ProviderPoint = _LOOP_DESTINATION
):
    return WalkingRouteRequest.model_validate(
        {
            "origin": {"latitude": origin.latitude, "longitude": origin.longitude},
            "destination": {
                "place_id": "dest",
                "name": "Dest",
                "location": {"latitude": destination.latitude, "longitude": destination.longitude},
            },
        }
    )


def test_get_loop_walking_route_selects_the_better_scoring_accepted_side() -> None:
    expected = _loop_route(_LOOP_ORIGIN, _LOOP_DESTINATION, _LOOP_LEFT.via, detour_ratio=1.05)
    provider = LoopFakeProvider(
        loop_by_via={
            _via_key(_LOOP_RIGHT.via): _loop_route(
                _LOOP_ORIGIN, _LOOP_DESTINATION, _LOOP_RIGHT.via, detour_ratio=1.35
            ),
            _via_key(_LOOP_LEFT.via): expected,
        }
    )
    service = MapsService(provider, 20, 20, 10, 8)

    result = service.get_loop_walking_route(_loop_request())

    assert result.return_is_same_path is False
    assert [leg.kind for leg in result.legs] == ["outbound", "return"]
    assert result.duration_seconds == (
        expected.outbound.duration_seconds + expected.inbound.duration_seconds
    )
    assert result.distance_meters == (
        expected.outbound.distance_meters + expected.inbound.distance_meters
    )
    assert result.legs[1].duration_seconds == expected.inbound.duration_seconds
    # origin/destination の完全一致（leg の path はスナップ点なので厳密一致は保証しない契約）。
    # bounds には常に origin/destination を含める（決定3 / 5.3）。
    assert result.bounds.north_east.latitude >= max(
        result.origin.latitude, result.destination.location.latitude
    )
    assert result.bounds.south_west.latitude <= min(
        result.origin.latitude, result.destination.location.latitude
    )


def test_get_loop_walking_route_selects_the_only_accepted_side() -> None:
    expected = _loop_route(_LOOP_ORIGIN, _LOOP_DESTINATION, _LOOP_RIGHT.via, detour_ratio=1.1)
    provider = LoopFakeProvider(
        loop_by_via={
            _via_key(_LOOP_RIGHT.via): expected,
            _via_key(_LOOP_LEFT.via): _loop_route(
                _LOOP_ORIGIN, _LOOP_DESTINATION, _LOOP_LEFT.via, accepted=False
            ),
        }
    )
    service = MapsService(provider, 20, 20, 10, 8)

    result = service.get_loop_walking_route(_loop_request())

    assert result.return_is_same_path is False
    assert result.duration_seconds == (
        expected.outbound.duration_seconds + expected.inbound.duration_seconds
    )


def test_get_loop_walking_route_falls_back_to_same_path_when_both_candidates_are_rejected() -> None:
    provider = LoopFakeProvider(
        loop_by_via={
            _via_key(_LOOP_RIGHT.via): _loop_route(
                _LOOP_ORIGIN, _LOOP_DESTINATION, _LOOP_RIGHT.via, accepted=False
            ),
            _via_key(_LOOP_LEFT.via): _loop_route(
                _LOOP_ORIGIN, _LOOP_DESTINATION, _LOOP_LEFT.via, accepted=False
            ),
        }
    )
    service = MapsService(provider, 20, 20, 10, 8)

    result = service.get_loop_walking_route(_loop_request())

    assert result.return_is_same_path is True
    assert result.legs[1].path == list(reversed(result.legs[0].path))
    assert result.duration_seconds == 2 * result.legs[0].duration_seconds
    assert result.distance_meters == 2 * result.legs[0].distance_meters
    assert provider.loop_call_count == 2
    assert provider.walking_route_call_count == 0


@pytest.mark.parametrize("failure", [GoogleMapsUnavailableError(), GoogleMapsQuotaError()])
def test_get_loop_walking_route_uses_the_only_successful_side(failure: Exception) -> None:
    accepted_route = _loop_route(_LOOP_ORIGIN, _LOOP_DESTINATION, _LOOP_RIGHT.via, detour_ratio=1.1)
    provider = LoopFakeProvider(
        loop_by_via={
            _via_key(_LOOP_RIGHT.via): accepted_route,
            _via_key(_LOOP_LEFT.via): failure,
        }
    )
    service = MapsService(provider, 20, 20, 10, 8)

    result = service.get_loop_walking_route(_loop_request())

    assert result.return_is_same_path is False
    assert provider.walking_route_call_count == 0


def test_get_loop_walking_route_logs_quota_for_the_failing_side_even_when_the_other_succeeds(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """QUALITY-1: 片方が Quota で片方が成功した場合でも、Quota は WARNING ログに残す
    （決定5。以前は両側とも失敗したときの集約ログにしか出ていなかった）。"""
    accepted_route = _loop_route(_LOOP_ORIGIN, _LOOP_DESTINATION, _LOOP_RIGHT.via, detour_ratio=1.1)
    provider = LoopFakeProvider(
        loop_by_via={
            _via_key(_LOOP_RIGHT.via): accepted_route,
            _via_key(_LOOP_LEFT.via): GoogleMapsQuotaError(),
        }
    )
    service = MapsService(provider, 20, 20, 10, 8)

    with caplog.at_level("WARNING"):
        result = service.get_loop_walking_route(_loop_request())

    assert result.return_is_same_path is False
    assert any(
        record.levelname == "WARNING" and "side=left" in record.getMessage()
        for record in caplog.records
    )


def test_get_loop_walking_route_reraises_unexpected_provider_exceptions() -> None:
    """QUALITY-2: `future.result()` は Quota/Unavailable 以外の例外（プログラムのバグ）を
    握りつぶさずそのまま送出する（ADR-007「移行・対応が必要な事項」相当のリスク対策の回帰テスト）。"""
    accepted_route = _loop_route(_LOOP_ORIGIN, _LOOP_DESTINATION, _LOOP_RIGHT.via, detour_ratio=1.1)
    provider = LoopFakeProvider(
        loop_by_via={
            _via_key(_LOOP_RIGHT.via): accepted_route,
            _via_key(_LOOP_LEFT.via): RuntimeError("boom"),
        }
    )
    service = MapsService(provider, 20, 20, 10, 8)

    with pytest.raises(RuntimeError, match="boom"):
        service.get_loop_walking_route(_loop_request())


def test_get_loop_walking_route_falls_back_to_single_fetch_when_both_are_unavailable() -> None:
    fallback_route = _straight_route(_LOOP_ORIGIN, _LOOP_DESTINATION)
    provider = LoopFakeProvider(
        loop_by_via={
            _via_key(_LOOP_RIGHT.via): GoogleMapsUnavailableError(),
            _via_key(_LOOP_LEFT.via): GoogleMapsUnavailableError(),
        },
        walking_route=fallback_route,
    )
    service = MapsService(provider, 20, 20, 10, 8)

    result = service.get_loop_walking_route(_loop_request())

    assert result.return_is_same_path is True
    assert provider.walking_route_call_count == 1
    assert result.legs[0].duration_seconds == fallback_route.duration_seconds


def test_get_loop_walking_route_raises_unavailable_when_the_fallback_fetch_also_fails() -> None:
    provider = LoopFakeProvider(
        loop_by_via={
            _via_key(_LOOP_RIGHT.via): GoogleMapsUnavailableError(),
            _via_key(_LOOP_LEFT.via): GoogleMapsUnavailableError(),
        },
        walking_route_error=GoogleMapsUnavailableError(),
    )
    service = MapsService(provider, 20, 20, 10, 8)

    with pytest.raises(MapsUnavailableError):
        service.get_loop_walking_route(_loop_request())


def test_get_loop_walking_route_raises_quota_error_without_a_fallback_fetch() -> None:
    provider = LoopFakeProvider(
        loop_by_via={
            _via_key(_LOOP_RIGHT.via): GoogleMapsQuotaError(),
            _via_key(_LOOP_LEFT.via): GoogleMapsQuotaError(),
        }
    )
    service = MapsService(provider, 20, 20, 10, 8)

    with pytest.raises(MapsQuotaError):
        service.get_loop_walking_route(_loop_request())
    assert provider.walking_route_call_count == 0


def test_get_loop_walking_route_uses_single_fetch_when_disabled_by_kill_switch() -> None:
    fallback_route = _straight_route(_LOOP_ORIGIN, _LOOP_DESTINATION)
    provider = LoopFakeProvider(walking_route=fallback_route)
    service = MapsService(provider, 20, 20, 10, 8, loop_route_enabled=False)

    result = service.get_loop_walking_route(_loop_request())

    assert result.return_is_same_path is True
    assert provider.loop_call_count == 0
    assert provider.walking_route_call_count == 1


def test_get_loop_walking_route_uses_single_fetch_when_too_close_for_a_loop() -> None:
    close_destination = ProviderPoint(35.0, 139.0003)  # haversine ≈ 27m (<50m)
    assert haversine_meters(_LOOP_ORIGIN, close_destination) < 50
    fallback_route = _straight_route(_LOOP_ORIGIN, close_destination)
    provider = LoopFakeProvider(walking_route=fallback_route)
    service = MapsService(provider, 20, 20, 10, 8)

    result = service.get_loop_walking_route(_loop_request(destination=close_destination))

    assert result.return_is_same_path is True
    assert provider.loop_call_count == 0


def test_get_loop_walking_route_returns_503_when_the_deadline_has_already_expired(
    monkeypatch,
) -> None:
    provider = LoopFakeProvider(
        loop_by_via={
            _via_key(_LOOP_RIGHT.via): GoogleMapsUnavailableError(),
            _via_key(_LOOP_LEFT.via): GoogleMapsUnavailableError(),
        }
    )
    service = MapsService(provider, 20, 20, 10, 8, route_deadline_seconds=5.0)
    # 1回目の monotonic() 呼び出しは deadline の起点、2回目は候補取得後の残り時間チェック。
    times = iter((0.0, 1_000.0))
    monkeypatch.setattr("sanposcape.maps.service.monotonic", lambda: next(times))

    with pytest.raises(MapsUnavailableError):
        service.get_loop_walking_route(_loop_request())
    assert provider.walking_route_call_count == 0


def test_get_loop_walking_route_logs_never_include_coordinates(
    caplog: pytest.LogCaptureFixture,
) -> None:
    provider = LoopFakeProvider(
        loop_by_via={
            _via_key(_LOOP_RIGHT.via): _loop_route(
                _LOOP_ORIGIN, _LOOP_DESTINATION, _LOOP_RIGHT.via, detour_ratio=1.1
            ),
            _via_key(_LOOP_LEFT.via): _loop_route(
                _LOOP_ORIGIN, _LOOP_DESTINATION, _LOOP_LEFT.via, accepted=False
            ),
        }
    )
    service = MapsService(provider, 20, 20, 10, 8)

    with caplog.at_level("INFO"):
        service.get_loop_walking_route(_loop_request())

    assert str(_LOOP_ORIGIN.latitude) not in caplog.text
    assert str(_LOOP_DESTINATION.latitude) not in caplog.text
    assert str(_LOOP_RIGHT.via.latitude) not in caplog.text
    assert str(_LOOP_LEFT.via.latitude) not in caplog.text
