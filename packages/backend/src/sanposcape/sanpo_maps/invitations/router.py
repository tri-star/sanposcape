import uuid

from fastapi import APIRouter, Depends, status

from sanposcape.dependencies import get_current_user, get_current_user_optional
from sanposcape.sanpo_maps.invitations.dependencies import (
    enforce_invitation_rate_limit,
    get_sanpo_map_invitation_service,
    require_map_invitation_enabled,
)
from sanposcape.sanpo_maps.invitations.schemas import (
    FeatureDisabledErrorRead,
    InvitationLimitErrorRead,
    InvitationNotFoundErrorRead,
    InvitationPreviewRead,
    InvitationTokenRequest,
    SanpoMapInvitationCreatedRead,
    SanpoMapInvitationListRead,
)
from sanposcape.sanpo_maps.invitations.service import SanpoMapInvitationService
from sanposcape.sanpo_maps.maps.schemas import SanpoMapRead
from sanposcape.users.models import User

router = APIRouter(tags=["sanpo-map-invitations"])

# `/sanpo-maps` 配下は `RequestSizeLimitMiddleware` の対象
# （maps/router.py と同じ理由で 413 を宣言）。
# `/invitations` 配下も main.py で同じ上限を掛ける。
_ERROR_RESPONSES = {
    401: {"description": "Not authenticated"},
    413: {"description": "Request body too large"},
}
_FEATURE_DISABLED = {
    403: {"model": FeatureDisabledErrorRead, "description": "Map invitation is disabled"},
}
_NOT_FOUND = {
    404: {"model": InvitationNotFoundErrorRead, "description": "Invitation not usable"},
}


@router.post(
    "/sanpo-maps/{sanpo_map_id}/invitations",
    response_model=SanpoMapInvitationCreatedRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="create_sanpo_map_invitation",
    dependencies=[Depends(require_map_invitation_enabled)],
    responses={
        **_ERROR_RESPONSES,
        403: {"description": "Permission denied, or map invitation is disabled"},
        404: {"description": "Sanpo map not found"},
        409: {"model": InvitationLimitErrorRead, "description": "Invitation or member limit"},
        422: {"description": "Validation error"},
    },
)
def create_sanpo_map_invitation(
    sanpo_map_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: SanpoMapInvitationService = Depends(get_sanpo_map_invitation_service),
) -> SanpoMapInvitationCreatedRead:
    """招待リンクを発行する（地図 owner のみ。editor は 403）。

    1つのリンクで参加できるのは1人、有効期限は7日。`token` と `url`（`<招待ページ>#<token>`）は
    この応答でだけ返す（DB にはハッシュだけを保存する）。メンバーが上限（10人）なら 409
    `member_limit_reached`、有効なリンクが上限（10件）なら 409 `invitation_limit_exceeded`。
    フラグ `map_invitation` が OFF なら 403 `feature_disabled`。
    """
    return service.create_invitation(current_user, sanpo_map_id)


@router.get(
    "/sanpo-maps/{sanpo_map_id}/invitations",
    response_model=SanpoMapInvitationListRead,
    operation_id="list_sanpo_map_invitations",
    responses={
        **_ERROR_RESPONSES,
        403: {"description": "Permission denied"},
        404: {"description": "Sanpo map not found"},
        422: {"description": "Validation error"},
    },
)
def list_sanpo_map_invitations(
    sanpo_map_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: SanpoMapInvitationService = Depends(get_sanpo_map_invitation_service),
) -> SanpoMapInvitationListRead:
    """有効な招待リンク（未使用・未取り消し・期限内）を新しい順に返す（owner のみ）。
    トークンは返さない。

    フラグではガードしない（OFF に戻しても、出したリンクを確かめて取り消せるように）。
    """
    return service.list_invitations(current_user, sanpo_map_id)


@router.delete(
    "/sanpo-maps/{sanpo_map_id}/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="revoke_sanpo_map_invitation",
    responses={
        **_ERROR_RESPONSES,
        403: {"description": "Permission denied"},
        404: {"description": "Sanpo map or invitation not found"},
        422: {"description": "Validation error"},
    },
)
def revoke_sanpo_map_invitation(
    sanpo_map_id: uuid.UUID,
    invitation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: SanpoMapInvitationService = Depends(get_sanpo_map_invitation_service),
) -> None:
    """招待リンクを取り消す（owner のみ）。有効なリンクでなければ 404（使用済み・期限切れも含む）。

    フラグではガードしない。
    """
    service.revoke_invitation(current_user, sanpo_map_id, invitation_id)


@router.post(
    "/invitations/preview",
    response_model=InvitationPreviewRead,
    operation_id="preview_invitation",
    dependencies=[Depends(require_map_invitation_enabled), Depends(enforce_invitation_rate_limit)],
    responses={
        **_FEATURE_DISABLED,
        **_NOT_FOUND,
        413: {"description": "Request body too large"},
        422: {"description": "Validation error"},
        429: {"description": "Rate limit exceeded"},
    },
)
def preview_invitation(
    payload: InvitationTokenRequest,
    current_user: User | None = Depends(get_current_user_optional),
    service: SanpoMapInvitationService = Depends(get_sanpo_map_invitation_service),
) -> InvitationPreviewRead:
    """招待の中身（地図の名前・アイコン・招待した人の表示名・期限）を返す。サインインは不要。

    トークンはボディで受ける（path・クエリに載せない）。使えないトークン（存在しない・使用済み・
    取り消し済み・期限切れ）は理由を区別せず 404 `invitation_not_found`。サインインしていれば、
    すでにメンバーかどうか（`membership`）も返す。
    """
    return service.preview(payload.token, current_user)


@router.post(
    "/invitations/accept",
    response_model=SanpoMapRead,
    operation_id="accept_invitation",
    dependencies=[Depends(require_map_invitation_enabled), Depends(enforce_invitation_rate_limit)],
    responses={
        **_ERROR_RESPONSES,
        **_FEATURE_DISABLED,
        **_NOT_FOUND,
        409: {"model": InvitationLimitErrorRead, "description": "Member limit reached"},
        422: {"description": "Validation error"},
        429: {"description": "Rate limit exceeded"},
    },
)
def accept_invitation(
    payload: InvitationTokenRequest,
    current_user: User = Depends(get_current_user),
    service: SanpoMapInvitationService = Depends(get_sanpo_map_invitation_service),
) -> SanpoMapRead:
    """招待を受けて地図に参加する（editor になる）。参加した地図を返す。

    すでにメンバーなら招待を使わずに 200 で同じ地図を返す（冪等）。使えないトークンは 404、
    メンバーが上限なら 409 `member_limit_reached`。
    """
    return service.accept(current_user, payload.token)
