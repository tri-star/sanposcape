"""ピンの移動先の候補（`GET /pins/{pin_id}/move-targets`, ADR-009 決定42, SS-192）。

移動は「移動先の地図に、移動元の地図の全メンバーが参加している」ときだけ許す
（`PinService.update_pin` が 403 `move_target_missing_members` で守る）。mobile が移せない地図を
最初から選べないようにし、理由（参加していない人の名前）と、移すと新しく見えるようになる人を
出せるよう、候補の地図ごとに両方の差分を返す。読み取りだけでロックも commit もしない。
"""

import uuid

from sanposcape.sanpo_maps.exceptions import PinNotFoundError
from sanposcape.sanpo_maps.maps.access import SanpoMapAccess
from sanposcape.sanpo_maps.maps.repository import SanpoMapMemberRow
from sanposcape.sanpo_maps.pins.repository import PinRepository
from sanposcape.sanpo_maps.pins.schemas import (
    PinMoveTargetListRead,
    PinMoveTargetMemberRead,
    PinMoveTargetRead,
)
from sanposcape.users.models import User


def _members_not_in(
    members: list[SanpoMapMemberRow], others: list[SanpoMapMemberRow]
) -> list[PinMoveTargetMemberRead]:
    """`members` のうち `others` にいない人を、`members` の並び（owner → 参加順）で返す。"""
    other_ids = {member.user_id for member in others}
    return [
        PinMoveTargetMemberRead(user_id=member.user_id, display_name=member.display_name)
        for member in members
        if member.user_id not in other_ids
    ]


class PinMoveTargetService:
    """ピンの移動先の候補を返す。

    返す名前は、呼んだ人が member である地図（ピンの今の地図と候補の地図）のメンバーに
    限られ、`GET /sanpo-maps/{id}/members` で既に見える範囲を越えない（決定38）。
    移動の権限（`can_move_pin_from`）はここでは見ない（見せる情報が増えないため）。
    """

    def __init__(self, repository: PinRepository, sanpo_map_access: SanpoMapAccess) -> None:
        self._repository = repository
        self._sanpo_map_access = sanpo_map_access

    def list_move_targets(self, current_user: User, pin_id: uuid.UUID) -> PinMoveTargetListRead:
        result = self._repository.get_for_member(user_id=current_user.id, pin_id=pin_id)
        if result is None:
            raise PinNotFoundError()
        pin, _role = result
        source_map_id = pin.sanpo_map_id

        maps = self._sanpo_map_access.list_members_of_my_maps(current_user)
        source_members = next((members for map_id, members in maps if map_id == source_map_id), [])
        return PinMoveTargetListRead(
            items=[
                PinMoveTargetRead(
                    sanpo_map_id=map_id,
                    missing_members=_members_not_in(source_members, members),
                    added_members=_members_not_in(members, source_members),
                )
                for map_id, members in maps
                if map_id != source_map_id
            ]
        )
