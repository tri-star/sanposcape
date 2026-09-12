import pytest

from sanposcape.integrations.google_maps.exceptions import (
    GoogleMapsQuotaError,
    GoogleMapsUnavailableError,
)
from sanposcape.integrations.google_maps.provider import (
    ProviderPlace,
    ProviderPoint,
    ProviderRoute,
    ProviderRouteLeg,
)
from sanposcape.maps.exceptions import MapsQuotaError, MapsUnavailableError
from sanposcape.maps.schemas import PlaceSearchRequest, WalkingRouteRequest
from sanposcape.maps.service import MapsService


class FakeProvider:
    """`GoogleMapsProvider` のローカルテストダブル。

    `integrations/google_maps/fake.py` の `FakeGoogleMapsProvider`（幾何計算で決定的な
    値を作る「公式」の fake）とは別物。こちらは `MapsService` のソート順・タイムアウト
    打ち切りロジックを検証するために、応答値（`duration_seconds` 等）を明示的に固定
    したいテスト専用のスタブで、`FakeGoogleMapsProvider` では代替できない。

    SS-33: `intermediates` を渡された場合(周回)には未対応。周回関連のテストは
    `RecordingRouteProvider` を使う(このスタブは search_places と one_way の
    シンプルな片道呼び出しの検証専用)。
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


class PartiallyFailingRouteProvider:
    """既存バグ回帰テスト用: 特定の候補地点への経路取得だけを失敗させる。

    再現条件(SS-33 目視確認で発見, SS-14 由来のバグ): 起点とほぼ同一地点にある候補
    (例: 起点=駅の目の前で `station` を検索したときのその駅自身)への `computeRoutes`
    は、Google からは 200 が返るが折れ線が1点に退化しており、
    `HttpGoogleMapsProvider._load_route` が `GoogleMapsUnavailableError` を投げる。
    その1件の失敗で探索全体が 503 になってはいけない、という契約を固定する。
    """

    def __init__(self, places: tuple[ProviderPlace, ...], failing_locations: set[ProviderPoint]):
        self.places = places
        self._failing_locations = failing_locations
        self.route_calls: list[ProviderPoint] = []

    def search_places(self, origin, categories, limit, **kwargs):
        return self.places[:limit]

    def get_walking_route(self, origin, destination, **kwargs):
        self.route_calls.append(destination)
        if destination in self._failing_locations:
            # 退化したポリラインしか返らない候補(起点とほぼ同一地点)を模す。
            raise GoogleMapsUnavailableError()
        return ProviderRoute(200, 200, (ProviderPoint(35, 139), destination))


class RecordingRouteProvider:
    """SS-33 周回テスト専用: 呼び出しを記録し、あらかじめ用意した応答/例外を順番に返す。

    `get_walking_route` の呼び出し回数・`intermediates` の内容(再試行で経由点が
    切り替わること)を検証できるようにする。
    """

    def __init__(self, responses: list) -> None:
        self._responses = list(responses)
        self.calls: list[dict] = []

    def search_places(self, origin, categories, limit, **kwargs):
        raise NotImplementedError("RecordingRouteProvider is route-only")

    def get_walking_route(self, origin, destination, *, timeout_seconds, intermediates=()):
        self.calls.append(
            {"origin": origin, "destination": destination, "intermediates": intermediates}
        )
        response = self._responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


# 重複率がほぼ0(実測 <0.05)になる往路/復路の組(test_geometry.py と同じ構成)。
_ACCEPTED_OUTBOUND_PATH = (ProviderPoint(35.0, 139.0), ProviderPoint(35.01, 139.0))
_ACCEPTED_INBOUND_PATH = (ProviderPoint(35.0, 139.0), ProviderPoint(35.0, 139.02))
_ACCEPTED_LOOP_ROUTE = ProviderRoute(
    duration_seconds=600,
    distance_meters=800,
    path=_ACCEPTED_OUTBOUND_PATH + _ACCEPTED_INBOUND_PATH[1:],
    legs=(
        ProviderRouteLeg(duration_seconds=300, distance_meters=400, path=_ACCEPTED_OUTBOUND_PATH),
        ProviderRouteLeg(duration_seconds=300, distance_meters=400, path=_ACCEPTED_INBOUND_PATH),
    ),
)
# 復路 leg が往路 leg と同一の折れ線 = 重複率1.0(> 0.6) で必ず不採用になる組。
_REJECTED_LOOP_ROUTE = ProviderRoute(
    duration_seconds=600,
    distance_meters=800,
    path=_ACCEPTED_OUTBOUND_PATH,
    legs=(
        ProviderRouteLeg(duration_seconds=300, distance_meters=400, path=_ACCEPTED_OUTBOUND_PATH),
        ProviderRouteLeg(duration_seconds=300, distance_meters=400, path=_ACCEPTED_OUTBOUND_PATH),
    ),
)


def _loop_request() -> WalkingRouteRequest:
    return WalkingRouteRequest.model_validate(
        {
            "origin": {"latitude": 35.0, "longitude": 139.0},
            "destination": {"location": {"latitude": 35.01, "longitude": 139.0}},
        }
    )


def test_search_filters_and_sorts_by_round_trip_then_distance() -> None:
    # LOOP_FACTOR は本テストの関心事(ソート順)と独立させるため 1.0 に固定する。
    service = MapsService(FakeProvider(), 20, 20, 10, 8, loop_duration_factor=1.0)
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


def test_search_applies_loop_duration_factor_to_round_trip_values() -> None:
    """SS-33 決定8: 片道×2×LOOP_FACTOR で候補を補正する。"""
    service = MapsService(FakeProvider(), 20, 20, 10, 8, loop_duration_factor=1.15)
    result = service.search_places(
        PlaceSearchRequest.model_validate(
            {
                "origin": {"latitude": 35, "longitude": 139},
                "round_trip_duration_minutes": 20,
                "categories": ["park"],
            }
        )
    )
    assert [candidate.id for candidate in result.candidates] == ["near", "far"]
    assert result.candidates[0].round_trip_duration_seconds == 460  # 200*2*1.15
    assert result.candidates[0].round_trip_distance_meters == 460
    assert result.candidates[1].round_trip_duration_seconds == 920  # 400*2*1.15
    assert result.candidates[1].round_trip_distance_meters == 1150  # 500*2*1.15


def test_search_loop_duration_factor_can_push_a_borderline_candidate_over_the_limit() -> None:
    service = MapsService(FakeProvider(), 20, 20, 10, 8, loop_duration_factor=1.15)
    result = service.search_places(
        PlaceSearchRequest.model_validate(
            {
                "origin": {"latitude": 35, "longitude": 139},
                # far は 800s(未補正)で 900s 以下だが、補正後は 920s で超過する。
                "round_trip_duration_minutes": 15,
                "categories": ["park"],
            }
        )
    )
    assert [candidate.id for candidate in result.candidates] == ["near"]


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


def test_search_skips_candidate_with_unavailable_route_and_returns_remaining_candidates(
    caplog,
) -> None:
    """既存バグ回帰テスト(SS-33目視確認で発見、SS-14由来)。

    起点とほぼ同一地点にある候補(例: 起点=駅の目の前でstationを検索したときの
    その駅自身)への経路取得が `GoogleMapsUnavailableError` で失敗しても、
    `/explore/places` 全体を 503 にせず、その候補だけ除外して残りを 200 で返す。
    """
    degenerate_location = ProviderPoint(35.0001, 139.0001)  # 起点とほぼ同一
    places = (
        ProviderPlace("self", "起点そのもの", "station", degenerate_location),
        ProviderPlace("near", "近い駅", "station", ProviderPoint(35.2, 139.2)),
    )
    provider = PartiallyFailingRouteProvider(places, failing_locations={degenerate_location})
    service = MapsService(provider, 20, 20, 10, 8, loop_duration_factor=1.0)

    with caplog.at_level("WARNING"):
        result = service.search_places(
            PlaceSearchRequest.model_validate(
                {
                    "origin": {"latitude": 35, "longitude": 139},
                    "round_trip_duration_minutes": 20,
                    "categories": ["station"],
                }
            )
        )

    assert [candidate.id for candidate in result.candidates] == ["near"]
    assert len(provider.route_calls) == 2  # 失敗した候補も試行はされ、次の候補へ進む
    assert "candidate" in caplog.text  # スキップした事実がログから追える
    # 座標・APIキー等の生の値はログに出さない(既存方針)
    assert "35.0001" not in caplog.text
    assert "139.0001" not in caplog.text


def test_search_quota_error_during_route_fan_out_aborts_entire_search() -> None:
    """クォータエラー(429)は個別候補の失敗として握りつぶさず、探索全体を打ち切る。"""

    class QuotaErrorOnSecondCallProvider(FakeProvider):
        def __init__(self) -> None:
            super().__init__()
            self.route_calls = 0

        def get_walking_route(self, origin, destination, **kwargs):
            self.route_calls += 1
            if self.route_calls == 1:
                raise GoogleMapsQuotaError()
            return super().get_walking_route(origin, destination, **kwargs)

    provider = QuotaErrorOnSecondCallProvider()
    service = MapsService(provider, 20, 20, 10, 8)

    with pytest.raises(MapsQuotaError):
        service.search_places(
            PlaceSearchRequest.model_validate(
                {
                    "origin": {"latitude": 35, "longitude": 139},
                    "round_trip_duration_minutes": 20,
                    "categories": ["park"],
                }
            )
        )

    assert provider.route_calls == 1  # 2件目の候補へは進まない


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
                "route_type": "one_way",
            }
        )
    )
    assert result.route_type == "one_way"
    assert result.legs == []
    assert result.return_is_same_path is False
    assert result.destination.name == "Near"
    assert len(result.path) == 2
    assert result.bounds.north_east == result.path[-1]


def test_get_walking_route_one_way_calls_provider_once_without_intermediates() -> None:
    provider = RecordingRouteProvider(
        [
            ProviderRoute(
                duration_seconds=120,
                distance_meters=150,
                path=(ProviderPoint(35.0, 139.0), ProviderPoint(35.001, 139.001)),
            )
        ]
    )
    service = MapsService(provider, 20, 20, 10, 8)

    result = service.get_walking_route(
        WalkingRouteRequest.model_validate(
            {
                "origin": {"latitude": 35.0, "longitude": 139.0},
                "destination": {"location": {"latitude": 35.001, "longitude": 139.001}},
                "route_type": "one_way",
            }
        )
    )

    assert len(provider.calls) == 1
    assert provider.calls[0]["intermediates"] == ()
    assert result.route_type == "one_way"
    assert result.legs == []
    assert result.return_is_same_path is False
    assert result.duration_seconds == 120


def test_get_walking_route_without_place_id_or_name_returns_empty_destination_name() -> None:
    """SS-33 決定15: place_id 任意化の帰結。422にはならず空文字を返す(表示文言は発明しない)。"""
    provider = RecordingRouteProvider([_ACCEPTED_LOOP_ROUTE])
    service = MapsService(provider, 20, 20, 10, 8)

    result = service.get_walking_route(_loop_request())

    assert result.destination.place_id is None
    assert result.destination.name == ""


def test_get_walking_route_loop_returns_two_legs_summed_and_concatenated() -> None:
    provider = RecordingRouteProvider([_ACCEPTED_LOOP_ROUTE])
    service = MapsService(provider, 20, 20, 10, 8)

    result = service.get_walking_route(_loop_request())

    assert len(provider.calls) == 1
    assert result.route_type == "loop"
    assert [leg.kind for leg in result.legs] == ["outbound", "return"]
    assert result.return_is_same_path is False
    outbound_leg, inbound_leg = result.legs
    assert result.duration_seconds == outbound_leg.duration_seconds + inbound_leg.duration_seconds
    assert result.distance_meters == outbound_leg.distance_meters + inbound_leg.distance_meters
    assert result.path == outbound_leg.path + inbound_leg.path[1:]
    all_points = outbound_leg.path + inbound_leg.path
    assert result.bounds.north_east.latitude == max(p.latitude for p in all_points)
    assert result.bounds.north_east.longitude == max(p.longitude for p in all_points)
    assert result.bounds.south_west.latitude == min(p.latitude for p in all_points)
    assert result.bounds.south_west.longitude == min(p.longitude for p in all_points)


def test_get_walking_route_loop_retries_second_waypoint_when_first_is_rejected() -> None:
    provider = RecordingRouteProvider([_REJECTED_LOOP_ROUTE, _ACCEPTED_LOOP_ROUTE])
    service = MapsService(provider, 20, 20, 10, 8)

    result = service.get_walking_route(_loop_request())

    assert len(provider.calls) == 2
    assert result.return_is_same_path is False
    first_via = next(item.point for item in provider.calls[0]["intermediates"] if item.via)
    second_via = next(item.point for item in provider.calls[1]["intermediates"] if item.via)
    assert first_via != second_via  # 1回目=右、2回目=左(決定4)で異なる経由点になる


def test_get_walking_route_loop_falls_back_to_same_path_when_both_waypoints_are_rejected() -> None:
    provider = RecordingRouteProvider([_REJECTED_LOOP_ROUTE, _REJECTED_LOOP_ROUTE])
    service = MapsService(provider, 20, 20, 10, 8)

    result = service.get_walking_route(_loop_request())

    assert len(provider.calls) == 2  # 追加の Google 呼び出しをしない(決定6)
    assert result.return_is_same_path is True
    assert [leg.kind for leg in result.legs] == ["outbound", "return"]
    outbound_leg, inbound_leg = result.legs
    assert inbound_leg.path == list(reversed(outbound_leg.path))
    assert inbound_leg.duration_seconds == outbound_leg.duration_seconds
    assert inbound_leg.distance_meters == outbound_leg.distance_meters


def test_get_walking_route_loop_raises_unavailable_when_no_attempt_ever_succeeds() -> None:
    """例外フォールバック: 1回も使える応答が無ければ最終的に 503 系のまま(既存挙動を壊さない)。"""
    provider = RecordingRouteProvider(
        [
            GoogleMapsUnavailableError(),
            GoogleMapsUnavailableError(),
            GoogleMapsUnavailableError(),  # intermediates無しの最終フォールバックも失敗
        ]
    )
    service = MapsService(provider, 20, 20, 10, 8)

    with pytest.raises(MapsUnavailableError):
        service.get_walking_route(_loop_request())

    assert len(provider.calls) == 3


def test_get_walking_route_loop_quota_error_short_circuits_without_retrying() -> None:
    provider = RecordingRouteProvider([GoogleMapsQuotaError()])
    service = MapsService(provider, 20, 20, 10, 8)

    with pytest.raises(MapsQuotaError):
        service.get_walking_route(_loop_request())

    assert len(provider.calls) == 1  # 429相当は再試行せず即座に伝播する


def test_get_walking_route_loop_falls_back_to_plain_call_when_both_waypoints_error() -> None:
    """両経由点とも例外/空応答だった場合、最後に intermediates 無しの片道呼び出しへ
    落ちる(決定6)。"""
    provider = RecordingRouteProvider(
        [
            GoogleMapsUnavailableError(),
            GoogleMapsUnavailableError(),
            ProviderRoute(
                duration_seconds=200,
                distance_meters=250,
                path=(ProviderPoint(35.0, 139.0), ProviderPoint(35.01, 139.0)),
            ),
        ]
    )
    service = MapsService(provider, 20, 20, 10, 8)

    result = service.get_walking_route(_loop_request())

    assert len(provider.calls) == 3
    assert provider.calls[2]["intermediates"] == ()
    assert result.return_is_same_path is True
    assert result.legs[0].duration_seconds == 200


def test_get_walking_route_loop_skips_second_waypoint_when_deadline_is_nearly_exhausted(
    monkeypatch,
) -> None:
    provider = RecordingRouteProvider([_REJECTED_LOOP_ROUTE])
    service = MapsService(provider, 20, 20, 10, 8)  # route_timeout_seconds=8 -> 半分=4
    # 1回目の呼び出し後、残り時間が 4s を切っている状態を作る(決定9)。
    times = iter((0.0, 0.0, 9.0))
    monkeypatch.setattr("sanposcape.maps.service.monotonic", lambda: next(times))

    result = service.get_walking_route(_loop_request())

    assert len(provider.calls) == 1  # 2回目の経由点は試行されない
    assert result.return_is_same_path is True


def test_get_walking_route_loop_request_uses_single_call_when_kill_switch_is_disabled() -> None:
    provider = RecordingRouteProvider(
        [
            ProviderRoute(
                duration_seconds=100,
                distance_meters=120,
                path=(ProviderPoint(35.0, 139.0), ProviderPoint(35.01, 139.0)),
            )
        ]
    )
    service = MapsService(provider, 20, 20, 10, 8, loop_enabled=False)

    result = service.get_walking_route(_loop_request())

    assert len(provider.calls) == 1
    assert provider.calls[0]["intermediates"] == ()
    assert result.route_type == "loop"
    assert result.return_is_same_path is True
    outbound_leg, inbound_leg = result.legs
    assert inbound_leg.path == list(reversed(outbound_leg.path))
