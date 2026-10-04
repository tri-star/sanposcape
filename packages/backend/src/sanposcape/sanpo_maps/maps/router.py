import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from sanposcape.dependencies import get_current_user
from sanposcape.sanpo_maps.maps.dependencies import get_sanpo_map_service
from sanposcape.sanpo_maps.maps.schemas import (
    SANPO_MAP_TAG_LIST_DEFAULT_LIMIT,
    SANPO_MAP_TAG_LIST_MAX_LIMIT,
    SanpoMapCreate,
    SanpoMapListQuery,
    SanpoMapListRead,
    SanpoMapRead,
    SanpoMapTagListRead,
    SanpoMapUpdate,
)
from sanposcape.sanpo_maps.maps.service import SanpoMapService
from sanposcape.users.models import User

router = APIRouter(prefix="/sanpo-maps", tags=["sanpo-maps"])

# `RequestSizeLimitMiddleware`（core/middleware.py）は `/sanpo-maps` 配下の全 HTTP メソッドの
# Content-Length をチェックするため、全エンドポイントで一律にこのレスポンスセットを使う
# （`pins/router.py` と同じ理由）。
_ERROR_RESPONSES = {
    401: {"description": "Not authenticated"},
    413: {"description": "Request body too large"},
}


@router.get(
    "",
    response_model=SanpoMapListRead,
    operation_id="list_sanpo_maps",
    responses={**_ERROR_RESPONSES, 422: {"description": "Validation error"}},
)
def list_sanpo_maps(
    query: Annotated[SanpoMapListQuery, Query()],
    current_user: User = Depends(get_current_user),
    service: SanpoMapService = Depends(get_sanpo_map_service),
) -> SanpoMapListRead:
    """自分が member である地図を全件返す（ページングなし。MVP は件数が少ない前提）。

    `?expand=pin_count` を指定すると各要素の `pin_count` が整数で埋まる（ピンが無い
    地図は0）。未指定なら `pin_count` は null のまま。各要素の `icon` は地図のアイコン
    （未設定は無く、既定は `pin`）。
    """
    return service.list_maps(current_user, include_pin_count="pin_count" in query.expand)


@router.post(
    "",
    response_model=SanpoMapRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="create_sanpo_map",
    responses={**_ERROR_RESPONSES, 422: {"description": "Validation error"}},
)
def create_sanpo_map(
    payload: SanpoMapCreate,
    current_user: User = Depends(get_current_user),
    service: SanpoMapService = Depends(get_sanpo_map_service),
) -> SanpoMapRead:
    """地図を新規作成する（作成者が owner になる）。

    自分の既定地図がまだ無ければ、作った地図が既定になる（`is_default` はリクエストで
    指定できない）。名前の重複は許可する。冪等キーは持たない。`icon` を省略すると
    `pin` になる。
    """
    return service.create_map(current_user, payload)


@router.patch(
    "/{sanpo_map_id}",
    response_model=SanpoMapRead,
    operation_id="update_sanpo_map",
    responses={
        **_ERROR_RESPONSES,
        403: {"description": "Permission denied"},
        404: {"description": "Sanpo map not found"},
        422: {"description": "Validation error"},
    },
)
def update_sanpo_map(
    sanpo_map_id: uuid.UUID,
    payload: SanpoMapUpdate,
    current_user: User = Depends(get_current_user),
    service: SanpoMapService = Depends(get_sanpo_map_service),
) -> SanpoMapRead:
    """地図の名前・アイコンを変更する。空のボディ `{}` は何も変えずに 200 を返す。

    地図 owner のみ可（editor は 403）。非メンバー・存在しない ID は 404。同名への
    変更も 200。名前・アイコンの変更では `updated_at` を更新しない。
    """
    return service.update_map(current_user, sanpo_map_id, payload)


@router.delete(
    "/{sanpo_map_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="delete_sanpo_map",
    responses={
        **_ERROR_RESPONSES,
        403: {"description": "Permission denied"},
        404: {"description": "Sanpo map not found"},
    },
)
def delete_sanpo_map(
    sanpo_map_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: SanpoMapService = Depends(get_sanpo_map_service),
) -> None:
    """地図を削除する。ピン・写真・タグも DB の `ON DELETE CASCADE` で消え、S3 の写真の
    実体は best-effort で削除する（ストレージ障害・未構成でも 204 のまま）。

    地図 owner のみ可（editor は 403）。非メンバー・存在しない ID は 404。非冪等
    （削除済み ID への再送も 404）。消したのが既定地図なら、残りの地図のうち
    `updated_at DESC, id DESC` の先頭が新しい既定に繰り上がる。
    """
    service.delete_map(current_user, sanpo_map_id)


@router.get(
    "/{sanpo_map_id}/tags",
    response_model=SanpoMapTagListRead,
    operation_id="list_sanpo_map_tags",
    responses={
        **_ERROR_RESPONSES,
        404: {"description": "Sanpo map not found"},
        422: {"description": "Validation error"},
    },
)
def list_sanpo_map_tags(
    sanpo_map_id: uuid.UUID,
    limit: int = Query(
        default=SANPO_MAP_TAG_LIST_DEFAULT_LIMIT, ge=1, le=SANPO_MAP_TAG_LIST_MAX_LIMIT
    ),
    current_user: User = Depends(get_current_user),
    service: SanpoMapService = Depends(get_sanpo_map_service),
) -> SanpoMapTagListRead:
    """地図内の全ピン（作成者を問わない）のタグを、正規化キー（`label_key`）単位にまとめて返す。

    `label` は同じキーで最後に付けられた表記。並び順は付いているピン数の多い順
    （`pin_count DESC`）→ 最後に使われた日時の新しい順 → `label_key` の昇順。`limit`
    件（既定100・最大200）まで返し、続きは取れない（上位 N 件のランキング）。タグが
    無ければ `items` は空。

    地図の member（owner・editor）なら呼べる。非メンバー・存在しない ID は 404。
    """
    return service.list_tags(current_user, sanpo_map_id, limit=limit)
