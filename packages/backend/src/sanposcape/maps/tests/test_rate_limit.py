from types import SimpleNamespace

from fastapi.testclient import TestClient

from sanposcape.config import Settings
from sanposcape.dependencies import get_current_user_optional
from sanposcape.integrations.google_maps.provider import ProviderPoint, ProviderRoute
from sanposcape.main import create_app
from sanposcape.maps import rate_limit
from sanposcape.maps.dependencies import get_maps_service
from sanposcape.maps.rate_limit import ExploreRateLimiter
from sanposcape.maps.service import MapsService


def test_authenticated_rate_limit_rejects_same_user_across_ips() -> None:
    limiter = ExploreRateLimiter(max_requests=1, anonymous_max_requests=1, window_seconds=60)

    assert limiter.allow(user_id="user-1", client_ip="127.0.0.1")
    assert not limiter.allow(user_id="user-1", client_ip="127.0.0.2")


def test_authenticated_rate_limit_rejects_different_users_on_same_ip() -> None:
    limiter = ExploreRateLimiter(max_requests=1, anonymous_max_requests=1, window_seconds=60)

    assert limiter.allow(user_id="user-1", client_ip="127.0.0.1")
    assert not limiter.allow(user_id="user-2", client_ip="127.0.0.1")


def test_anonymous_requests_use_only_their_lower_ip_bucket() -> None:
    limiter = ExploreRateLimiter(max_requests=2, anonymous_max_requests=1, window_seconds=60)

    assert limiter.allow(user_id=None, client_ip="127.0.0.1")
    assert not limiter.allow(user_id=None, client_ip="127.0.0.1")
    # 匿名の低い上限が、同じ NAT 配下の認証済みリクエストを消費・制限しない。
    assert limiter.allow(user_id="user-1", client_ip="127.0.0.1")


def test_rate_limiter_removes_expired_buckets_and_bounds_new_keys(
    monkeypatch,
) -> None:
    now = 100.0
    monkeypatch.setattr(rate_limit, "monotonic", lambda: now)
    limiter = ExploreRateLimiter(max_requests=2, anonymous_max_requests=1, window_seconds=60)

    assert limiter.allow(user_id=None, client_ip="expired")
    now = 161.0
    assert limiter.allow(user_id=None, client_ip="current")
    assert "anonymous-ip:expired" not in limiter._buckets

    for index in range(limiter._MAX_BUCKETS - 1):
        assert limiter.allow(user_id=None, client_ip=f"ip-{index}")
    assert len(limiter._buckets) == limiter._MAX_BUCKETS

    assert not limiter.allow(user_id=None, client_ip="overflow")
    assert len(limiter._buckets) == limiter._MAX_BUCKETS
    assert "anonymous-ip:current" in limiter._buckets
    assert "anonymous-ip:overflow" not in limiter._buckets
    # 新規キーが満杯状態で拒否されても、既存キーの未期限切れ履歴は保持する。
    assert not limiter.allow(user_id=None, client_ip="current")

    now = 222.0
    assert limiter.allow(user_id=None, client_ip="overflow")


def test_anonymous_explore_endpoint_returns_429_after_ip_limit() -> None:
    class Provider:
        def search_places(self, *args, **kwargs):
            return ()

        def get_walking_route(self, *args, **kwargs):
            return ProviderRoute(1, 1, (ProviderPoint(35, 139), ProviderPoint(35.1, 139.1)))

    app = create_app(
        Settings(
            env="test",
            google_maps_rate_limit_requests=2,
            google_maps_anonymous_rate_limit_requests=1,
        )
    )
    app.dependency_overrides[get_maps_service] = lambda: MapsService(Provider(), 20, 20, 10, 8)
    payload = {
        "origin": {"latitude": 35, "longitude": 139},
        "destination": {"place_id": "opaque", "location": {"latitude": 35.1, "longitude": 139.1}},
    }
    with TestClient(app) as client:
        assert client.post("/explore/routes/walking", json=payload).status_code == 200
        assert client.post("/explore/routes/walking", json=payload).status_code == 429


def test_authenticated_explore_endpoint_keeps_user_and_ip_limit() -> None:
    class Provider:
        def search_places(self, *args, **kwargs):
            return ()

        def get_walking_route(self, *args, **kwargs):
            return ProviderRoute(1, 1, (ProviderPoint(35, 139), ProviderPoint(35.1, 139.1)))

    app = create_app(
        Settings(
            env="test",
            google_maps_rate_limit_requests=1,
            google_maps_anonymous_rate_limit_requests=1,
        )
    )
    app.dependency_overrides[get_current_user_optional] = lambda: SimpleNamespace(id="user-1")
    app.dependency_overrides[get_maps_service] = lambda: MapsService(Provider(), 20, 20, 10, 8)
    payload = {
        "origin": {"latitude": 35, "longitude": 139},
        "destination": {"place_id": "opaque", "location": {"latitude": 35.1, "longitude": 139.1}},
    }
    with TestClient(app) as client:
        assert client.post("/explore/routes/walking", json=payload).status_code == 200
        assert client.post("/explore/routes/walking", json=payload).status_code == 429
