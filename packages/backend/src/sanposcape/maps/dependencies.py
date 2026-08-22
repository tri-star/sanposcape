from fastapi import Depends, HTTPException, Request

from sanposcape.config import Settings, get_settings
from sanposcape.dependencies import get_current_user_optional
from sanposcape.integrations.google_maps.provider import GoogleMapsProvider
from sanposcape.maps.rate_limit import ExploreRateLimiter
from sanposcape.maps.service import MapsService


def get_google_maps_provider(request: Request) -> GoogleMapsProvider:
    """App-lifespan singleton; router tests can override this dependency directly."""
    return request.app.state.google_maps_provider


def get_explore_rate_limiter(request: Request) -> ExploreRateLimiter:
    return request.app.state.explore_rate_limiter


def enforce_explore_rate_limit(
    request: Request,
    current_user: object | None = Depends(get_current_user_optional),
    limiter: ExploreRateLimiter = Depends(get_explore_rate_limiter),
) -> None:
    user_id = str(getattr(current_user, "id", "unknown")) if current_user is not None else None
    client_ip = request.client.host if request.client else "unknown"
    if not limiter.allow(user_id=user_id, client_ip=client_ip):
        raise HTTPException(status_code=429, detail="Explore request rate limit exceeded")


def get_maps_service(
    settings: Settings = Depends(get_settings),
    provider: GoogleMapsProvider = Depends(get_google_maps_provider),
) -> MapsService:
    return MapsService(
        provider,
        max_place_candidates=settings.google_maps_max_place_candidates,
        max_route_requests=settings.google_maps_max_route_requests_per_search,
        search_deadline_seconds=settings.google_maps_search_deadline_seconds,
        route_timeout_seconds=settings.google_maps_read_timeout_seconds,
        loop_enabled=settings.google_maps_loop_route_enabled,
        loop_duration_factor=settings.google_maps_loop_duration_factor,
        route_deadline_seconds=settings.google_maps_route_deadline_seconds,
    )
