from fastapi import APIRouter, Depends

from sanposcape.auth.dependencies import get_auth_service
from sanposcape.auth.router import _to_session_read
from sanposcape.auth.schemas import DevSessionCreate, SessionRead
from sanposcape.auth.service import AuthService

# include_in_schema=False: 本番に存在しないエンドポイントを公開 API 契約に載せない（D6）。
# `AUTH_MODE=dev` のときだけ create_app() が include するが、include されていても
# OpenAPI スキーマには一切現れない（ルーティングとスキーマ掲載は独立した2軸）。
router = APIRouter(prefix="/auth", tags=["auth-dev"], include_in_schema=False)


@router.post("/dev-session", response_model=SessionRead)
def create_dev_session(
    payload: DevSessionCreate,
    service: AuthService = Depends(get_auth_service),
) -> SessionRead:
    result = service.create_dev_session(payload.user_key)
    return _to_session_read(result)
