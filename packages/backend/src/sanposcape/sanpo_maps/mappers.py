"""service 層の戻り値（モデル）をレスポンススキーマへ変換するマッパー（`pins/mappers.py`
と同じ位置づけ）。
"""

import uuid

from sanposcape.sanpo_maps.models import SanpoMap
from sanposcape.sanpo_maps.schemas import SanpoMapRead, SanpoMapRole


def to_sanpo_map_read(
    sanpo_map: SanpoMap,
    *,
    role: SanpoMapRole,
    current_user_id: uuid.UUID,
    pin_count: int | None = None,
) -> SanpoMapRead:
    """`is_default` は「リクエストユーザーにとっての既定地図か」（`sanpo_maps.is_default
    AND owner_user_id == 自分`, B-D2）。`pin_count` は `?expand=pin_count` のときだけ
    整数で渡される（未指定は None のまま応答へ通す, ADR-009 決定29）。
    """
    return SanpoMapRead(
        id=sanpo_map.id,
        name=sanpo_map.name,
        is_default=bool(sanpo_map.is_default and sanpo_map.owner_user_id == current_user_id),
        role=role,
        pin_count=pin_count,
        created_at=sanpo_map.created_at,
        updated_at=sanpo_map.updated_at,
    )
