from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from sanposcape.database import get_db
from sanposcape.dependencies import get_current_user
from sanposcape.maps.rate_limit import ExploreRateLimiter
from sanposcape.users.models import User
from sanposcape.walks.repository import WalkRepository
from sanposcape.walks.service import WalkService


def get_walk_service(db: Session = Depends(get_db)) -> WalkService:
    """request-scoped session を使う WalkService を供給する。"""
    return WalkService(db, WalkRepository(db))


def get_walk_create_rate_limiter(request: Request) -> ExploreRateLimiter:
    return request.app.state.walk_create_rate_limiter


def enforce_walk_create_rate_limit(
    request: Request,
    current_user: User = Depends(get_current_user),
    limiter: ExploreRateLimiter = Depends(get_walk_create_rate_limiter),
) -> None:
    """散歩の保存（`POST /walks`）のレート制限（SS-38）。ユーザー単位だけで数える。

    route と同じ `get_current_user` に依存するので、FastAPI のリクエスト内キャッシュで
    token の検証は1回のまま。未認証は 401 が先に返り、枠を消費しない。
    limiter は IP の枠を使わない設定（`main.py` の `walk_create_rate_limiter`）なので、
    `client_ip` は数えるキーに入らない。
    """
    client_ip = request.client.host if request.client else "unknown"
    if not limiter.allow(user_id=str(current_user.id), client_ip=client_ip):
        raise HTTPException(status_code=429, detail="Walk create request rate limit exceeded")
