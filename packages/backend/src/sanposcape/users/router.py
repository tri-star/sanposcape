from fastapi import APIRouter, Depends, status

from sanposcape.dependencies import get_current_user
from sanposcape.users.dependencies import get_account_deletion_service
from sanposcape.users.models import User
from sanposcape.users.service import AccountDeletionService

router = APIRouter(prefix="/users", tags=["users"])


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        503: {"description": "Identity provider unavailable; the account was not deleted"},
    },
)
def delete_me(
    current_user: User = Depends(get_current_user),
    service: AccountDeletionService = Depends(get_account_deletion_service),
) -> None:
    """Bearer token で解決した本人のアカウントを削除する。

    Apple ユーザーは削除の前に Apple のトークンを失効させる。Apple の一時障害で失効できない
    ときは、アカウントを削除せず 503 を返す（再試行すれば完了できる）。
    """
    service.delete_account(current_user)
