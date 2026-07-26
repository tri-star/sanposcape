from fastapi import APIRouter, Depends, status

from sanposcape.dependencies import get_current_user
from sanposcape.users.dependencies import get_user_service
from sanposcape.users.models import User
from sanposcape.users.service import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    current_user: User = Depends(get_current_user),
    service: UserService = Depends(get_user_service),
) -> None:
    """Bearer token で解決した本人のアカウントを削除する。"""
    service.delete_current_user(current_user)
