from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import AwareDatetime

from sanposcape.dependencies import get_current_user
from sanposcape.users.models import User
from sanposcape.walks.dependencies import get_walk_service
from sanposcape.walks.schemas import WalkCreate, WalkDetailRead, WalkListRead, WalkRead
from sanposcape.walks.service import WalkService

router = APIRouter(prefix="/walks", tags=["walks"])

_ERROR_RESPONSES = {
    401: {"description": "Not authenticated"},
    413: {"description": "Request body too large"},
}


@router.post(
    "",
    response_model=WalkRead,
    status_code=status.HTTP_201_CREATED,
    responses={
        **_ERROR_RESPONSES,
        200: {"description": "Idempotent replay: an existing walk with the same client_walk_id"},
        422: {"description": "Validation error"},
    },
)
def create_walk(
    payload: WalkCreate,
    response: Response,
    current_user: User = Depends(get_current_user),
    service: WalkService = Depends(get_walk_service),
) -> WalkRead:
    """散歩の記録を保存する。

    `client_walk_id` の再送は同じ散歩として扱い、新規作成のみ 201、
    冪等な再送は 200 を返す（軌跡はエコーバックしない: モバイルは送信済みの値を持つ）。
    """
    walk, created = service.record_walk(current_user, payload)
    if not created:
        response.status_code = status.HTTP_200_OK
    return walk


@router.get(
    "",
    response_model=WalkListRead,
    responses={**_ERROR_RESPONSES, 400: {"description": "Invalid cursor"}},
)
def list_walks(
    limit: int = Query(default=20, ge=1, le=50),
    cursor: str | None = Query(default=None),
    started_after: AwareDatetime | None = Query(default=None),
    started_before: AwareDatetime | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    service: WalkService = Depends(get_walk_service),
) -> WalkListRead:
    """散歩履歴の一覧を `started_at DESC` の keyset ページネーションで返す。"""
    return service.list_walks(
        current_user,
        limit=limit,
        cursor=cursor,
        started_after=started_after,
        started_before=started_before,
    )


@router.get(
    "/{walk_id}",
    response_model=WalkDetailRead,
    responses={**_ERROR_RESPONSES, 404: {"description": "Walk not found"}},
)
def get_walk(
    walk_id: UUID,
    current_user: User = Depends(get_current_user),
    service: WalkService = Depends(get_walk_service),
) -> WalkDetailRead:
    """散歩1件の詳細（軌跡付き）を返す。他ユーザーの散歩・存在しない ID は 404（D6）。"""
    return service.get_walk(current_user, walk_id)
