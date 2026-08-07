from sanposcape.integrations.google_maps.fake import FakeGoogleMapsProvider
from sanposcape.integrations.google_maps.provider import ProviderPoint
from sanposcape.maps.schemas import PlaceSearchRequest
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
    assert provider.search_places(_ORIGIN, (), 20, timeout_seconds=1) == ()


def test_search_places_cycles_categories_when_fewer_than_place_count() -> None:
    provider = FakeGoogleMapsProvider()
    places = provider.search_places(_ORIGIN, ("park",), 20, timeout_seconds=1)

    assert len(places) == 5
    assert all(place.category == "park" for place in places)
    # categories が1種類でも name は連番のおかげで衝突しない（D-6）。
    assert len({place.name for place in places}) == len(places)


def test_walking_route_is_deterministic_and_map_ready() -> None:
    provider = FakeGoogleMapsProvider()
    destination = ProviderPoint(35.69, 139.78)

    first = provider.get_walking_route(_ORIGIN, destination, timeout_seconds=1)
    second = provider.get_walking_route(_ORIGIN, destination, timeout_seconds=1)

    assert first == second
    assert len(first.path) == 5
    assert first.path[0] == _ORIGIN
    assert first.path[-1] == destination
    assert first.duration_seconds == round(first.distance_meters / 1.25)


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
