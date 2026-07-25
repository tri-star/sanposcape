from fastapi import APIRouter, Depends, status

from sanposcape.auth.dependencies import get_auth_service
from sanposcape.auth.mappers import to_session_read
from sanposcape.auth.schemas import (
    AuthUserRead,
    SessionCreate,
    SessionLogoutRequest,
    SessionRead,
    SessionRefreshRequest,
)
from sanposcape.auth.service import AuthService
from sanposcape.dependencies import get_current_user
from sanposcape.users.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/session", response_model=SessionRead)
def create_session(
    payload: SessionCreate,
    service: AuthService = Depends(get_auth_service),
) -> SessionRead:
    result = service.create_session(payload.provider, payload.id_token)
    return to_session_read(result)


@router.post("/refresh", response_model=SessionRead)
def refresh_session(
    payload: SessionRefreshRequest,
    service: AuthService = Depends(get_auth_service),
) -> SessionRead:
    result = service.refresh(payload.refresh_token)
    return to_session_read(result)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    payload: SessionLogoutRequest,
    service: AuthService = Depends(get_auth_service),
) -> None:
    service.logout(payload.refresh_token)


@router.get("/me", response_model=AuthUserRead)
def get_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
