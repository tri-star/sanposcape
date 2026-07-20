from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class HealthStatus(BaseModel):
    status: str


@router.get("/health", response_model=HealthStatus)
def health_check() -> HealthStatus:
    """ロードバランサ・compose healthcheck 用の疎通確認エンドポイント。"""
    return HealthStatus(status="ok")
