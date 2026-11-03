from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from sanposcape.app_config.dependencies import get_feature_flags
from sanposcape.config import Settings, get_settings
from sanposcape.core.feature_flags import FeatureFlags
from sanposcape.database import get_db
from sanposcape.dependencies import get_current_user_optional
from sanposcape.maps.rate_limit import ExploreRateLimiter
from sanposcape.sanpo_maps.exceptions import FeatureDisabledError
from sanposcape.sanpo_maps.invitations.repository import SanpoMapInvitationRepository
from sanposcape.sanpo_maps.invitations.service import SanpoMapInvitationService
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository

#: 招待の発行・preview・accept をガードするフラグ（ADR-009 決定39）。
MAP_INVITATION_FLAG = "map_invitation"


def get_sanpo_map_invitation_service(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SanpoMapInvitationService:
    """request-scoped session を使う SanpoMapInvitationService を供給する。"""
    return SanpoMapInvitationService(
        db,
        SanpoMapInvitationRepository(db),
        SanpoMapRepository(db),
        url_base=settings.invitation_url_base,
    )


def require_map_invitation_enabled(flags: FeatureFlags = Depends(get_feature_flags)) -> None:
    """フラグ `map_invitation` が OFF なら 403 `feature_disabled`。ポリシーの施行日より前に本番で
    招待を使えてしまわないよう、mobile の出し分けに加えて API もガードする（ADR-009 決定39）。
    """
    if not flags.is_enabled(MAP_INVITATION_FLAG):
        raise FeatureDisabledError()


def get_invitation_rate_limiter(request: Request) -> ExploreRateLimiter:
    return request.app.state.invitation_rate_limiter


def enforce_invitation_rate_limit(
    request: Request,
    current_user: object | None = Depends(get_current_user_optional),
    limiter: ExploreRateLimiter = Depends(get_invitation_rate_limiter),
) -> None:
    """preview・accept のレート制限（IP・ユーザー単位。探索 API と同じ仕組み）。"""
    user_id = str(getattr(current_user, "id", "unknown")) if current_user is not None else None
    client_ip = request.client.host if request.client else "unknown"
    if not limiter.allow(user_id=user_id, client_ip=client_ip):
        raise HTTPException(status_code=429, detail="Invitation request rate limit exceeded")
