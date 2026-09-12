import json
import math

import httpx
import pytest

from sanposcape.config import Settings
from sanposcape.integrations.google_maps.client import (
    HttpGoogleMapsProvider,
    UnconfiguredGoogleMapsProvider,
    build_google_maps_provider,
)
from sanposcape.integrations.google_maps.exceptions import (
    GoogleMapsQuotaError,
    GoogleMapsUnavailableError,
)
from sanposcape.integrations.google_maps.fake import FakeGoogleMapsProvider
from sanposcape.integrations.google_maps.provider import (
    ProviderIntermediate,
    ProviderPoint,
)


def _provider(handler):
    transport = httpx.MockTransport(handler)
    return HttpGoogleMapsProvider(
        Settings(google_maps_server_api_key="server-key"), client=httpx.Client(transport=transport)
    )


def test_search_normalizes_places_and_caches_successes() -> None:
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        assert request.headers["x-goog-api-key"] == "server-key"
        assert (
            request.headers["x-goog-fieldmask"]
            == "places.id,places.displayName,places.location,places.types"
        )
        assert json.loads(request.content) == {
            "includedTypes": ["park"],
            "languageCode": "ja",
            "maxResultCount": 20,
            "locationRestriction": {
                "circle": {"center": {"latitude": 35, "longitude": 139}, "radius": 2000.0}
            },
            "regionCode": "JP",
        }
        return httpx.Response(
            200,
            json={
                "places": [
                    {
                        "id": "opaque",
                        "displayName": {"text": "  芝公園  "},
                        "location": {"latitude": 35, "longitude": 139},
                        "types": ["park"],
                    }
                ]
            },
        )

    provider = _provider(handler)
    origin = ProviderPoint(35, 139)
    first = provider.search_places(origin, ("park",), 20, timeout_seconds=2)
    second = provider.search_places(origin, ("park",), 20, timeout_seconds=2)
    assert first == second
    assert first[0].name == "芝公園"
    assert first[0].category == "park"
    assert calls == 1


def test_search_keeps_provider_language_fallback_name() -> None:
    provider = _provider(
        lambda request: httpx.Response(
            200,
            json={
                "places": [
                    {
                        "id": "opaque",
                        "displayName": {"text": "Tokyo Station"},
                        "location": {"latitude": 35, "longitude": 139},
                        "types": ["train_station"],
                    }
                ]
            },
        )
    )

    places = provider.search_places(ProviderPoint(35, 139), ("station",), 20, timeout_seconds=2)

    assert [place.name for place in places] == ["Tokyo Station"]


@pytest.mark.parametrize(
    "display_name",
    [{"text": ""}, {"text": "   "}, {}, {"text": 123}, None],
)
def test_search_skips_only_candidates_without_usable_display_name(display_name: object) -> None:
    provider = _provider(
        lambda request: httpx.Response(
            200,
            json={
                "places": [
                    {
                        "id": "invalid-name",
                        "displayName": display_name,
                        "location": {"latitude": 35, "longitude": 139},
                        "types": ["park"],
                    },
                    {
                        "id": "valid-name",
                        "displayName": {"text": "有効な公園"},
                        "location": {"latitude": 35.1, "longitude": 139.1},
                        "types": ["park"],
                    },
                ]
            },
        )
    )

    places = provider.search_places(ProviderPoint(35, 139), ("park",), 20, timeout_seconds=2)

    assert [place.id for place in places] == ["valid-name"]


def test_search_returns_empty_tuple_when_all_candidates_have_unusable_display_names() -> None:
    provider = _provider(
        lambda request: httpx.Response(
            200,
            json={
                "places": [
                    {
                        "id": "empty-name",
                        "displayName": {"text": " "},
                        "location": {"latitude": 35, "longitude": 139},
                        "types": ["park"],
                    }
                ]
            },
        )
    )

    assert provider.search_places(ProviderPoint(35, 139), ("park",), 20, timeout_seconds=2) == ()


@pytest.mark.parametrize(
    "place",
    [
        {
            "displayName": {"text": "有効名"},
            "location": {"latitude": 35, "longitude": 139},
            "types": ["park"],
        },
        {
            "id": "missing-location",
            "displayName": {"text": "有効名"},
            "types": ["park"],
        },
        {
            "id": "invalid-coordinate",
            "displayName": {"text": "有効名"},
            "location": {"latitude": "not-a-number", "longitude": 139},
            "types": ["park"],
        },
        {
            "id": "invalid-types",
            "displayName": {"text": "有効名"},
            "location": {"latitude": 35, "longitude": 139},
            "types": [{}],
        },
        {
            "id": "out-of-range-latitude",
            "displayName": {"text": "有効名"},
            "location": {"latitude": 90.1, "longitude": 139},
            "types": ["park"],
        },
        {
            "id": "out-of-range-longitude",
            "displayName": {"text": "有効名"},
            "location": {"latitude": 35, "longitude": -180.1},
            "types": ["park"],
        },
    ],
)
def test_search_keeps_non_name_place_structure_errors_unavailable(place: dict[str, object]) -> None:
    provider = _provider(lambda request: httpx.Response(200, json={"places": [place]}))

    with pytest.raises(GoogleMapsUnavailableError):
        provider.search_places(ProviderPoint(35, 139), ("park",), 20, timeout_seconds=2)


def test_search_normalizes_non_finite_coordinates_to_unavailable() -> None:
    body = json.dumps(
        {
            "places": [
                {
                    "id": "nan-coordinate",
                    "displayName": {"text": "有効名"},
                    "location": {"latitude": math.nan, "longitude": 139},
                    "types": ["park"],
                }
            ]
        },
        allow_nan=True,
    )
    provider = _provider(lambda request: httpx.Response(200, content=body))

    with pytest.raises(GoogleMapsUnavailableError):
        provider.search_places(ProviderPoint(35, 139), ("park",), 20, timeout_seconds=2)


def test_route_decodes_polyline() -> None:
    provider = _provider(
        lambda request: httpx.Response(
            200,
            json={
                "routes": [
                    {
                        "duration": "123.4s",
                        "distanceMeters": 456,
                        "polyline": {"encodedPolyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@"},
                    }
                ]
            },
        )
    )
    route = provider.get_walking_route(
        ProviderPoint(38.5, -120.2), ProviderPoint(43.252, -126.453), timeout_seconds=2
    )
    assert route.duration_seconds == 123
    assert len(route.path) == 3


def _loop_response_json(
    outbound_duration: str = "300s",
    outbound_distance: int = 400,
    outbound_polyline: str = "_p~iF~ps|U_ulLnnqC",
    inbound_duration: str = "360s",
    inbound_distance: int = 420,
    inbound_polyline: str = "_p~iF~ps|U_mqNvxq`@",
) -> dict:
    return {
        "routes": [
            {
                "duration": "660s",
                "distanceMeters": outbound_distance + inbound_distance,
                "legs": [
                    {
                        "duration": outbound_duration,
                        "distanceMeters": outbound_distance,
                        "polyline": {"encodedPolyline": outbound_polyline},
                    },
                    {
                        "duration": inbound_duration,
                        "distanceMeters": inbound_distance,
                        "polyline": {"encodedPolyline": inbound_polyline},
                    },
                ],
            }
        ]
    }


def test_loop_route_sends_intermediates_in_order_with_via_flag_only_on_waypoint() -> None:
    captured: dict = {}

    def handler(request):
        captured["body"] = json.loads(request.content)
        captured["field_mask"] = request.headers["x-goog-fieldmask"]
        return httpx.Response(200, json=_loop_response_json())

    provider = _provider(handler)
    origin = ProviderPoint(35.0, 139.0)
    stopover = ProviderPoint(35.1, 139.1)
    waypoint = ProviderPoint(35.05, 139.2)

    provider.get_walking_route(
        origin,
        origin,
        timeout_seconds=2,
        intermediates=(
            ProviderIntermediate(point=stopover, via=False),
            ProviderIntermediate(point=waypoint, via=True),
        ),
    )

    assert captured["body"]["intermediates"] == [
        {"location": {"latLng": {"latitude": 35.1, "longitude": 139.1}}},
        {"location": {"latLng": {"latitude": 35.05, "longitude": 139.2}}, "via": True},
    ]


def test_loop_route_field_mask_includes_legs_and_excludes_polyline() -> None:
    captured: dict = {}

    def handler(request):
        captured["field_mask"] = request.headers["x-goog-fieldmask"]
        return httpx.Response(200, json=_loop_response_json())

    provider = _provider(handler)
    origin = ProviderPoint(35.0, 139.0)

    provider.get_walking_route(
        origin,
        origin,
        timeout_seconds=2,
        intermediates=(
            ProviderIntermediate(point=ProviderPoint(35.1, 139.1), via=False),
            ProviderIntermediate(point=ProviderPoint(35.05, 139.2), via=True),
        ),
    )

    assert captured["field_mask"] == (
        "routes.duration,routes.distanceMeters,"
        "routes.legs.duration,routes.legs.distanceMeters,routes.legs.polyline.encodedPolyline"
    )
    # 全体 polyline(routes.polyline.encodedPolyline)は要求しない(決定3: legs だけを取る)。
    assert "routes.polyline" not in captured["field_mask"]


def test_one_way_route_field_mask_is_unchanged_and_has_no_intermediates() -> None:
    """探索(候補ごとの片道呼び出し)の payload が SS-33 で太らないことの回帰防止。"""
    captured: dict = {}

    def handler(request):
        captured["body"] = json.loads(request.content)
        captured["field_mask"] = request.headers["x-goog-fieldmask"]
        return httpx.Response(
            200,
            json={
                "routes": [
                    {
                        "duration": "123.4s",
                        "distanceMeters": 456,
                        "polyline": {"encodedPolyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@"},
                    }
                ]
            },
        )

    provider = _provider(handler)
    provider.get_walking_route(
        ProviderPoint(35.0, 139.0), ProviderPoint(35.1, 139.1), timeout_seconds=2
    )

    assert "intermediates" not in captured["body"]
    assert captured["field_mask"] == (
        "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline"
    )


def test_loop_route_parses_legs_duration_distance_and_concatenates_path() -> None:
    provider = _provider(lambda request: httpx.Response(200, json=_loop_response_json()))
    origin = ProviderPoint(35.0, 139.0)

    result = provider.get_walking_route(
        origin,
        origin,
        timeout_seconds=2,
        intermediates=(
            ProviderIntermediate(point=ProviderPoint(35.1, 139.1), via=False),
            ProviderIntermediate(point=ProviderPoint(35.05, 139.2), via=True),
        ),
    )

    assert len(result.legs) == 2
    outbound, inbound = result.legs
    assert outbound.duration_seconds == 300
    assert outbound.distance_meters == 400
    assert inbound.duration_seconds == 360
    assert inbound.distance_meters == 420
    # 全体 path は legs の連結。inbound の先頭点(接合点)は重複させないため落とす。
    assert result.path == outbound.path + inbound.path[1:]


def test_loop_route_with_return_leg_shorter_than_two_points_keeps_outbound_only() -> None:
    """復路 leg が壊れていても例外は投げず、往路(legs[0])だけの1件をserviceへ届ける(決定6)。

    service 側はこの「1件だけ返った」応答を、`len(route.legs) == 2` の場合のみ
    evaluate_loop で評価し、`len(route.legs) >= 1` であれば直近の使える往路として
    フォールバック候補に更新する。
    """
    body = _loop_response_json(inbound_polyline="")  # デコード結果が0点になる不正な polyline
    provider = _provider(lambda request: httpx.Response(200, json=body))
    origin = ProviderPoint(35.0, 139.0)

    result = provider.get_walking_route(
        origin,
        origin,
        timeout_seconds=2,
        intermediates=(
            ProviderIntermediate(point=ProviderPoint(35.1, 139.1), via=False),
            ProviderIntermediate(point=ProviderPoint(35.05, 139.2), via=True),
        ),
    )

    assert len(result.legs) == 1
    assert result.legs[0].duration_seconds == 300
    assert result.path == result.legs[0].path  # 全体pathはoutboundのpathのまま


def test_loop_route_raises_unavailable_when_outbound_leg_itself_is_broken() -> None:
    body = _loop_response_json(outbound_polyline="")
    provider = _provider(lambda request: httpx.Response(200, json=body))
    origin = ProviderPoint(35.0, 139.0)

    with pytest.raises(GoogleMapsUnavailableError):
        provider.get_walking_route(
            origin,
            origin,
            timeout_seconds=2,
            intermediates=(
                ProviderIntermediate(point=ProviderPoint(35.1, 139.1), via=False),
                ProviderIntermediate(point=ProviderPoint(35.05, 139.2), via=True),
            ),
        )


def test_loop_route_raises_unavailable_when_routes_is_present_but_empty() -> None:
    """2026-08-22 実 API スモークテストで実在を確認した
    「200 + routes 空」応答(handover-notes.md)。"""
    provider = _provider(lambda request: httpx.Response(200, json={}))
    origin = ProviderPoint(35.0, 139.0)

    with pytest.raises(GoogleMapsUnavailableError):
        provider.get_walking_route(
            origin,
            origin,
            timeout_seconds=2,
            intermediates=(
                ProviderIntermediate(point=ProviderPoint(35.1, 139.1), via=False),
                ProviderIntermediate(point=ProviderPoint(35.05, 139.2), via=True),
            ),
        )


def test_loop_route_cache_key_distinguishes_left_and_right_waypoints() -> None:
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=_loop_response_json())

    provider = _provider(handler)
    origin = ProviderPoint(35.0, 139.0)
    stopover = ProviderPoint(35.1, 139.1)
    right = ProviderPoint(35.05, 139.2)
    left = ProviderPoint(35.05, 138.9)

    provider.get_walking_route(
        origin,
        origin,
        timeout_seconds=2,
        intermediates=(
            ProviderIntermediate(point=stopover, via=False),
            ProviderIntermediate(point=right, via=True),
        ),
    )
    provider.get_walking_route(
        origin,
        origin,
        timeout_seconds=2,
        intermediates=(
            ProviderIntermediate(point=stopover, via=False),
            ProviderIntermediate(point=left, via=True),
        ),
    )

    assert calls == 2  # 左右で別キーになり、どちらもキャッシュに当たらない


def test_one_way_route_cache_key_is_unchanged_by_ss33() -> None:
    """SS-32 と同一のキー形式を保つことで、/explore/places が温めたキャッシュを
    共有できる(決定7)。"""
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        return httpx.Response(
            200,
            json={
                "routes": [
                    {
                        "duration": "120s",
                        "distanceMeters": 300,
                        "polyline": {"encodedPolyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@"},
                    }
                ]
            },
        )

    provider = _provider(handler)
    origin = ProviderPoint(35.0, 139.0)
    destination = ProviderPoint(35.1, 139.1)

    provider.get_walking_route(origin, destination, timeout_seconds=2)
    provider.get_walking_route(origin, destination, timeout_seconds=2)

    assert calls == 1  # intermediates なしは従来どおりキャッシュが効く


@pytest.mark.parametrize(
    "status, exception",
    [
        (429, GoogleMapsQuotaError),
        (403, GoogleMapsUnavailableError),
        (503, GoogleMapsUnavailableError),
    ],
)
def test_upstream_errors_are_sanitized(status, exception) -> None:
    provider = _provider(lambda request: httpx.Response(status, json={"sensitive": "not exposed"}))
    with pytest.raises(exception):
        provider.search_places(ProviderPoint(35, 139), ("park",), 20, timeout_seconds=2)


def test_upstream_error_is_logged_with_status_and_reason(caplog) -> None:
    """403 の原因（APIキーの制限違反・API未有効化等）はサーバーログから追えること。

    クライアントには 503 しか返さないため、ここを記録しないと原因究明の手段が無くなる。
    実際に SS-15 の動作確認で、mobile 用の Android 制限付きキーを backend に設定してしまい
    503 だけが出続けて原因が分からない、という事象が起きた。
    """
    provider = _provider(
        lambda request: httpx.Response(
            403,
            json={
                "error": {
                    "code": 403,
                    "message": "Requests from this Android client application <empty> are blocked.",
                    "status": "PERMISSION_DENIED",
                    "details": [
                        {
                            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                            "reason": "API_KEY_ANDROID_APP_BLOCKED",
                        }
                    ],
                }
            },
        )
    )
    with caplog.at_level("WARNING"), pytest.raises(GoogleMapsUnavailableError):
        provider.search_places(ProviderPoint(35, 139), ("park",), 20, timeout_seconds=2)

    record = caplog.text
    assert "HTTP 403" in record
    assert "PERMISSION_DENIED" in record
    assert "API_KEY_ANDROID_APP_BLOCKED" in record
    assert "places:searchNearby" in record


def test_error_log_never_contains_the_api_key(caplog) -> None:
    """Google の文言にキーが含まれていてもログには出さない。"""
    provider = _provider(
        lambda request: httpx.Response(
            400,
            json={"error": {"status": "INVALID_ARGUMENT", "message": "API key server-key invalid"}},
        )
    )
    with caplog.at_level("WARNING"), pytest.raises(GoogleMapsUnavailableError):
        provider.search_places(ProviderPoint(35, 139), ("park",), 20, timeout_seconds=2)

    assert "server-key" not in caplog.text
    assert "***" in caplog.text


def test_non_json_error_body_still_logs_status_without_raising(caplog) -> None:
    """本文が JSON でなくてもログ処理自体が落ちないこと。"""
    provider = _provider(lambda request: httpx.Response(502, text="<html>Bad Gateway</html>"))
    with caplog.at_level("WARNING"), pytest.raises(GoogleMapsUnavailableError):
        provider.search_places(ProviderPoint(35, 139), ("park",), 20, timeout_seconds=2)

    assert "HTTP 502" in caplog.text


def test_transport_failure_is_logged(caplog) -> None:
    """接続不可・タイムアウトもログに残ること（コンテナから外部に出られない等の切り分け用）。"""

    def handler(request):
        raise httpx.ConnectError("connection refused")

    provider = _provider(handler)
    with caplog.at_level("WARNING"), pytest.raises(GoogleMapsUnavailableError):
        provider.search_places(ProviderPoint(35, 139), ("park",), 20, timeout_seconds=2)

    assert "ConnectError" in caplog.text


# 注意: このファイルには test_config.py のような env 隔離フィクスチャが無い。
# `Settings(...)` を作るときは env / maps_mode / google_maps_server_api_key を
# すべて明示的に渡すこと。省略すると開発者の `.env`（実キーを設定している人）で
# テスト結果が変わってしまう（同じ罠を踏んだ記録が tests/test_config.py にある）。


@pytest.mark.parametrize("server_api_key", ["", "server-key"])
def test_build_provider_returns_fake_when_maps_mode_is_fake(server_api_key: str) -> None:
    settings = Settings(env="test", maps_mode="fake", google_maps_server_api_key=server_api_key)
    assert isinstance(build_google_maps_provider(settings), FakeGoogleMapsProvider)


def test_build_provider_returns_unconfigured_when_real_mode_without_key() -> None:
    settings = Settings(env="test", maps_mode="real", google_maps_server_api_key="")
    assert isinstance(build_google_maps_provider(settings), UnconfiguredGoogleMapsProvider)


def test_build_provider_returns_http_when_real_mode_with_key() -> None:
    settings = Settings(env="test", maps_mode="real", google_maps_server_api_key="server-key")
    provider = build_google_maps_provider(settings)
    try:
        assert isinstance(provider, HttpGoogleMapsProvider)
    finally:
        provider.close()
