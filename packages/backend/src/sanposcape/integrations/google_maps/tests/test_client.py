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
from sanposcape.integrations.google_maps.provider import ProviderPoint


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


_LOOP_LEG = {
    "duration": "100s",
    "distanceMeters": 200,
    "polyline": {"encodedPolyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@"},
}


def test_loop_route_sends_intermediates_with_via_flag_and_two_leg_field_mask() -> None:
    captured: dict = {}

    def handler(request):
        captured["headers"] = request.headers
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "routes": [
                    {
                        "legs": [
                            _LOOP_LEG,
                            {**_LOOP_LEG, "duration": "150s", "distanceMeters": 300},
                        ]
                    }
                ]
            },
        )

    provider = _provider(handler)
    origin = ProviderPoint(35, 139)
    destination = ProviderPoint(35.1, 139.1)
    via = ProviderPoint(35.05, 139.05)

    loop_route = provider.get_walking_loop_route(origin, destination, via, timeout_seconds=2)

    assert captured["headers"]["x-goog-fieldmask"] == (
        "routes.legs.duration,routes.legs.distanceMeters,routes.legs.polyline.encodedPolyline"
    )
    assert captured["body"] == {
        "origin": {"location": {"latLng": {"latitude": 35, "longitude": 139}}},
        "destination": {"location": {"latLng": {"latitude": 35, "longitude": 139}}},
        "intermediates": [
            {"location": {"latLng": {"latitude": 35.1, "longitude": 139.1}}},
            {"location": {"latLng": {"latitude": 35.05, "longitude": 139.05}}, "via": True},
        ],
        "travelMode": "WALK",
    }
    assert loop_route.outbound.duration_seconds == 100
    assert loop_route.outbound.distance_meters == 200
    assert len(loop_route.outbound.path) == 3
    assert loop_route.inbound.duration_seconds == 150
    assert loop_route.inbound.distance_meters == 300
    assert len(loop_route.inbound.path) == 3


@pytest.mark.parametrize("leg_count", [1, 3])
def test_loop_route_requires_exactly_two_legs(leg_count: int) -> None:
    provider = _provider(
        lambda request: httpx.Response(200, json={"routes": [{"legs": [_LOOP_LEG] * leg_count}]})
    )
    with pytest.raises(GoogleMapsUnavailableError):
        provider.get_walking_loop_route(
            ProviderPoint(35, 139),
            ProviderPoint(35.1, 139.1),
            ProviderPoint(35.05, 139.05),
            timeout_seconds=2,
        )


def test_loop_route_requires_each_leg_polyline_to_have_at_least_two_points() -> None:
    empty_polyline_leg = {**_LOOP_LEG, "polyline": {"encodedPolyline": ""}}
    provider = _provider(
        lambda request: httpx.Response(
            200, json={"routes": [{"legs": [empty_polyline_leg, _LOOP_LEG]}]}
        )
    )
    with pytest.raises(GoogleMapsUnavailableError):
        provider.get_walking_loop_route(
            ProviderPoint(35, 139),
            ProviderPoint(35.1, 139.1),
            ProviderPoint(35.05, 139.05),
            timeout_seconds=2,
        )


def test_loop_route_quota_error_is_propagated() -> None:
    provider = _provider(lambda request: httpx.Response(429, json={}))
    with pytest.raises(GoogleMapsQuotaError):
        provider.get_walking_loop_route(
            ProviderPoint(35, 139),
            ProviderPoint(35.1, 139.1),
            ProviderPoint(35.05, 139.05),
            timeout_seconds=2,
        )


def test_loop_route_caches_successful_response() -> None:
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"routes": [{"legs": [_LOOP_LEG, _LOOP_LEG]}]})

    provider = _provider(handler)
    origin, destination = ProviderPoint(35, 139), ProviderPoint(35.1, 139.1)
    via = ProviderPoint(35.05, 139.05)

    first = provider.get_walking_loop_route(origin, destination, via, timeout_seconds=2)
    second = provider.get_walking_loop_route(origin, destination, via, timeout_seconds=2)

    assert first == second
    assert calls == 1


def test_loop_route_and_walking_route_do_not_share_a_cache_entry() -> None:
    calls = {"route": 0, "loop": 0}

    def handler(request):
        body = json.loads(request.content)
        if "intermediates" in body:
            calls["loop"] += 1
            return httpx.Response(200, json={"routes": [{"legs": [_LOOP_LEG, _LOOP_LEG]}]})
        calls["route"] += 1
        return httpx.Response(
            200,
            json={
                "routes": [
                    {
                        "duration": "100s",
                        "distanceMeters": 200,
                        "polyline": {"encodedPolyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@"},
                    }
                ]
            },
        )

    provider = _provider(handler)
    origin, destination = ProviderPoint(35, 139), ProviderPoint(35.1, 139.1)
    via = ProviderPoint(35.05, 139.05)

    provider.get_walking_route(origin, destination, timeout_seconds=2)
    provider.get_walking_loop_route(origin, destination, via, timeout_seconds=2)
    provider.get_walking_route(origin, destination, timeout_seconds=2)
    provider.get_walking_loop_route(origin, destination, via, timeout_seconds=2)

    assert calls == {"route": 1, "loop": 1}


def test_request_keeps_the_configured_connect_timeout_even_when_the_deadline_is_longer() -> None:
    """ARCH-Warning: 単一の float を `timeout=` に渡すと httpx は connect/read/write/pool の
    全フェーズに同じ値を適用してしまい、`google_maps_connect_timeout_seconds`（既定3秒）が
    `route_deadline_seconds`（最大25秒）に実質上書きされる。connect フェーズだけは
    `google_maps_connect_timeout_seconds` のまま短く保たれることを固定する。"""
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["timeout"] = request.extensions["timeout"]
        return httpx.Response(200, json={"places": []})

    transport = httpx.MockTransport(handler)
    settings = Settings(
        google_maps_server_api_key="server-key",
        google_maps_connect_timeout_seconds=3.0,
        google_maps_read_timeout_seconds=8.0,
    )
    provider = HttpGoogleMapsProvider(settings, client=httpx.Client(transport=transport))

    # ここでは 20 秒という大きな timeout_seconds（route_deadline_seconds 相当）を渡す。
    provider.search_places(ProviderPoint(35, 139), ("park",), 20, timeout_seconds=20.0)

    assert captured["timeout"]["connect"] == 3.0
    assert captured["timeout"]["read"] == 20.0


def test_request_caps_connect_timeout_to_the_deadline_when_the_deadline_is_shorter() -> None:
    """呼び出し側の残り時間が connect_timeout_seconds より短いときは、その残り時間を超えない
    （connect だけ長く待ってしまわないようにする）。"""
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["timeout"] = request.extensions["timeout"]
        return httpx.Response(200, json={"places": []})

    transport = httpx.MockTransport(handler)
    settings = Settings(
        google_maps_server_api_key="server-key", google_maps_connect_timeout_seconds=3.0
    )
    provider = HttpGoogleMapsProvider(settings, client=httpx.Client(transport=transport))

    provider.search_places(ProviderPoint(35, 139), ("park",), 20, timeout_seconds=1.0)

    assert captured["timeout"]["connect"] == 1.0
    assert captured["timeout"]["read"] == 1.0


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
