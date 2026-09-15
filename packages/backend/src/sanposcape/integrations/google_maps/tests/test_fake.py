from sanposcape.integrations.google_maps.fake import (
    _WALKING_SPEED_METERS_PER_SECOND,
    FakeGoogleMapsProvider,
    _clamp,
    _distance_meters,
)
from sanposcape.integrations.google_maps.provider import ProviderPoint
from sanposcape.maps.schemas import PlaceSearchRequest, WalkingRouteRequest
from sanposcape.maps.service import MapsService

_ORIGIN = ProviderPoint(35.6812, 139.7671)
_ALL_CATEGORIES = (
    "convenience_store",
    "supermarket",
    "retail",
    "facility",
    "park",
    "station",
)


def test_search_places_is_deterministic() -> None:
    provider = FakeGoogleMapsProvider()
    first = provider.search_places(_ORIGIN, _ALL_CATEGORIES, 20, timeout_seconds=1)
    second = provider.search_places(_ORIGIN, _ALL_CATEGORIES, 20, timeout_seconds=1)
    other_instance = FakeGoogleMapsProvider().search_places(
        _ORIGIN, _ALL_CATEGORIES, 20, timeout_seconds=1
    )
    assert first == second
    assert first == other_instance


def test_search_places_returns_stable_ids_names_and_categories() -> None:
    provider = FakeGoogleMapsProvider()
    places = provider.search_places(_ORIGIN, _ALL_CATEGORIES, 20, timeout_seconds=1)

    assert len(places) == 5
    assert [place.id for place in places] == [f"fake-place-{i}" for i in range(1, 6)]
    # category は引数 categories のみから循環割り当てされる（応答バリデーションで
    # ExploreCategory 以外を返すと 500 になるため、値の由来をここで固定する）。
    assert all(place.category in _ALL_CATEGORIES for place in places)
    assert [place.category for place in places] == list(_ALL_CATEGORIES)[:5]
    assert len({place.name for place in places}) == len(places)


def test_search_places_respects_limit() -> None:
    provider = FakeGoogleMapsProvider()

    assert len(provider.search_places(_ORIGIN, _ALL_CATEGORIES, 2, timeout_seconds=1)) == 2
    assert provider.search_places(_ORIGIN, _ALL_CATEGORIES, 0, timeout_seconds=1) == ()
    assert provider.search_places(_ORIGIN, _ALL_CATEGORIES, -1, timeout_seconds=1) == ()
    assert provider.search_places(_ORIGIN, (), 20, timeout_seconds=1) == ()


def test_search_places_cycles_categories_when_fewer_than_place_count() -> None:
    provider = FakeGoogleMapsProvider()
    places = provider.search_places(_ORIGIN, ("park",), 20, timeout_seconds=1)

    assert len(places) == 5
    assert all(place.category == "park" for place in places)
    # name は category ではなく index（連番）から作られるため、categories が1種類に
    # 縮退しても衝突しない。
    assert len({place.name for place in places}) == len(places)


def test_search_places_near_pole_origin_does_not_diverge_or_go_out_of_bounds() -> None:
    """cos(latitude) が極付近でゼロに潰れても _MIN_COS_LATITUDE ガードにより発散しない。

    さらに、オフセット後の座標が緯度 ±90・経度 ±180 の範囲を超える場合でも、
    _clamp により GeoPoint の ge/le 制約（ValidationError → 500）を破らないこと。
    """
    provider = FakeGoogleMapsProvider()
    origin = ProviderPoint(89.999999, 179.999999)

    places = provider.search_places(origin, _ALL_CATEGORIES, 20, timeout_seconds=1)

    assert len(places) == 5
    for place in places:
        assert -90.0 <= place.location.latitude <= 90.0
        assert -180.0 <= place.location.longitude <= 180.0


def test_clamp_bounds_latitude_and_longitude_to_geo_point_limits() -> None:
    over_the_pole_and_dateline = ProviderPoint(120.0, 250.0)
    under_the_pole_and_dateline = ProviderPoint(-120.0, -250.0)

    assert _clamp(over_the_pole_and_dateline) == ProviderPoint(90.0, 180.0)
    assert _clamp(under_the_pole_and_dateline) == ProviderPoint(-90.0, -180.0)


def test_walking_route_is_deterministic_and_map_ready() -> None:
    provider = FakeGoogleMapsProvider()
    destination = ProviderPoint(35.69, 139.78)

    first = provider.get_walking_route(_ORIGIN, destination, timeout_seconds=1)
    second = provider.get_walking_route(_ORIGIN, destination, timeout_seconds=1)

    assert first == second
    assert len(first.path) == 5
    assert first.path[0] == _ORIGIN
    assert first.path[-1] == destination
    # 丸め前の distance から直接計算する（実装と同じ式）。first.distance_meters は
    # 既に round() 済みの int なので、そこから再計算すると二重丸めになり実装式の
    # 変更を検知できなくなる。
    assert first.duration_seconds == round(_distance_meters(_ORIGIN, destination) / 1.25)


def test_walking_route_handles_degenerate_same_point_case() -> None:
    provider = FakeGoogleMapsProvider()
    route = provider.get_walking_route(_ORIGIN, _ORIGIN, timeout_seconds=1)

    assert route.distance_meters == 0
    assert route.duration_seconds == 0
    assert len(route.path) == 5
    assert all(point == _ORIGIN for point in route.path)


def test_candidates_survive_round_trip_filter() -> None:
    """fake が返す値が MapsService の往復所要時間フィルタを通ること（E2E の生命線）。

    PlaceCandidate の構築を経由するため、fake の category が ExploreCategory として
    妥当であることも同時に固定できる。
    """
    service = MapsService(FakeGoogleMapsProvider(), 20, 20, 10, 8)
    result = service.search_places(
        PlaceSearchRequest.model_validate(
            {
                "origin": {"latitude": 35.6812, "longitude": 139.7671},
                "round_trip_duration_minutes": 60,
                "categories": list(_ALL_CATEGORIES),
                "limit": 20,
            }
        )
    )

    assert len(result.candidates) == 5  # 3件以上を満たす
    assert all(candidate.round_trip_duration_seconds <= 3600 for candidate in result.candidates)


def test_loop_route_is_deterministic() -> None:
    provider = FakeGoogleMapsProvider()
    destination = ProviderPoint(35.69, 139.78)
    via = ProviderPoint(35.685, 139.775)

    first = provider.get_walking_loop_route(_ORIGIN, destination, via, timeout_seconds=1)
    second = provider.get_walking_loop_route(_ORIGIN, destination, via, timeout_seconds=1)
    other_instance = FakeGoogleMapsProvider().get_walking_loop_route(
        _ORIGIN, destination, via, timeout_seconds=1
    )

    assert first == second
    assert first == other_instance


def test_loop_route_outbound_is_origin_to_destination_and_inbound_passes_through_via() -> None:
    provider = FakeGoogleMapsProvider()
    destination = ProviderPoint(35.69, 139.78)
    via = ProviderPoint(35.685, 139.775)

    loop_route = provider.get_walking_loop_route(_ORIGIN, destination, via, timeout_seconds=1)

    assert loop_route.outbound.path[0] == _ORIGIN
    assert loop_route.outbound.path[-1] == destination
    assert loop_route.inbound.path[0] == destination
    assert loop_route.inbound.path[-1] == _ORIGIN
    assert via in loop_route.inbound.path


def test_loop_route_totals_equal_outbound_plus_inbound() -> None:
    provider = FakeGoogleMapsProvider()
    destination = ProviderPoint(35.69, 139.78)
    via = ProviderPoint(35.685, 139.775)

    loop_route = provider.get_walking_loop_route(_ORIGIN, destination, via, timeout_seconds=1)

    outbound_distance = _distance_meters(_ORIGIN, destination)
    inbound_distance = _distance_meters(destination, via) + _distance_meters(via, _ORIGIN)
    assert loop_route.inbound.duration_seconds == round(
        inbound_distance / _WALKING_SPEED_METERS_PER_SECOND
    )
    assert loop_route.inbound.distance_meters == round(inbound_distance)
    assert loop_route.outbound.distance_meters == round(outbound_distance)


def test_loop_route_handles_degenerate_same_point_case() -> None:
    provider = FakeGoogleMapsProvider()

    loop_route = provider.get_walking_loop_route(_ORIGIN, _ORIGIN, _ORIGIN, timeout_seconds=1)

    assert loop_route.outbound.distance_meters == 0
    assert loop_route.outbound.duration_seconds == 0
    assert loop_route.inbound.distance_meters == 0
    assert loop_route.inbound.duration_seconds == 0
    assert all(point == _ORIGIN for point in loop_route.inbound.path)


def test_fake_loop_is_accepted_for_every_fake_candidate() -> None:
    """E2E の生命線（SS-33）: `MAPS_MODE=fake` の全候補（200〜1000m）で周回が作れること。

    mobile の Maestro subflow は `spot-card-0`（= fake-place-1、origin から約200m）を選ぶ。
    しきい値を調整してこのテストが落ちたら、fake ではなくしきい値の妥当性を疑う
    （ADR-007 決定8）。
    """
    provider = FakeGoogleMapsProvider()
    service = MapsService(provider, 20, 20, 10, 8)
    places = provider.search_places(_ORIGIN, _ALL_CATEGORIES, 20, timeout_seconds=1)
    assert len(places) == 5

    for place in places:
        request = WalkingRouteRequest.model_validate(
            {
                "origin": {"latitude": _ORIGIN.latitude, "longitude": _ORIGIN.longitude},
                "destination": {
                    "place_id": place.id,
                    "name": place.name,
                    "location": {
                        "latitude": place.location.latitude,
                        "longitude": place.location.longitude,
                    },
                },
            }
        )

        result = service.get_loop_walking_route(request)

        assert result.return_is_same_path is False, place.id


def test_shortest_requested_duration_keeps_at_least_one_candidate() -> None:
    """将来オフセットを広げたときに、短時間指定で0件になる劣化を検知する。"""
    service = MapsService(FakeGoogleMapsProvider(), 20, 20, 10, 8)
    result = service.search_places(
        PlaceSearchRequest.model_validate(
            {
                "origin": {"latitude": 35.6812, "longitude": 139.7671},
                "round_trip_duration_minutes": 10,
                "categories": list(_ALL_CATEGORIES),
                "limit": 20,
            }
        )
    )

    assert len(result.candidates) >= 1
