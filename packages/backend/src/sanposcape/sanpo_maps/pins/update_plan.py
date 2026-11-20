"""`PATCH /pins/{pin_id}` の「何を求められたか」と「何が実際に変わるか」の算出（SS-258）。

DB にもストレージにも触れない純粋な計算だけを置く。権限の判定・タグの適用・commit は
`PinService.update_pin` が持つ（ADR-009 決定19・20・32・33）。
"""

import uuid
from dataclasses import dataclass

from sanposcape.sanpo_maps.models import Pin
from sanposcape.sanpo_maps.pins.schemas import PinUpdate


@dataclass(frozen=True)
class RequestedPinUpdate:
    """送られたフィールド。値が今と同じでも「送られた」とみなす（権限はこれで判定する。決定20）。"""

    name: bool
    memo: bool
    visited: bool
    archived: bool
    # 移動先の地図。送られていなければ None（`PinUpdate` が明示的な null を弾いているので、
    # 送られた値は UUID）。
    target_sanpo_map_id: uuid.UUID | None
    tag_add: bool
    tag_remove: bool

    @classmethod
    def from_payload(cls, payload: PinUpdate) -> "RequestedPinUpdate":
        fields_set = payload.model_fields_set
        return cls(
            name="name" in fields_set,
            memo="memo" in fields_set,
            visited="visited" in fields_set,
            archived="archived" in fields_set,
            target_sanpo_map_id=payload.sanpo_map_id if "sanpo_map_id" in fields_set else None,
            tag_add=bool(payload.add_tags),
            tag_remove=bool(payload.remove_tag_ids),
        )


@dataclass(frozen=True)
class PinFieldChanges:
    """タグ以外のフィールドで実際に変わるもの。

    `updated_at` は何かが変わったときだけ進める（決定23・32・33）。
    """

    name_changed: bool
    memo_changed: bool
    # 新しい値。送られていなければ None（`PinUpdate` が明示的な null を弾いているので、
    # 送られた値は bool）。
    new_visited: bool | None
    new_archived: bool | None
    visited_changed: bool
    archived_changed: bool
    # 更新の前の地図（commit 前に控える。R2）。
    from_sanpo_map_id: uuid.UUID
    # 実際に地図が変わるときだけ移動先の ID が入る（同じ地図への PATCH は変更なし）。
    moved_to_sanpo_map_id: uuid.UUID | None

    @property
    def map_changed(self) -> bool:
        return self.moved_to_sanpo_map_id is not None

    @property
    def any_changed(self) -> bool:
        return (
            self.name_changed
            or self.memo_changed
            or self.visited_changed
            or self.archived_changed
            or self.map_changed
        )


def plan_field_changes(
    pin: Pin, payload: PinUpdate, requested: RequestedPinUpdate
) -> PinFieldChanges:
    new_visited = payload.visited if requested.visited else None
    new_archived = payload.archived if requested.archived else None
    target = requested.target_sanpo_map_id
    return PinFieldChanges(
        name_changed=requested.name and payload.name != pin.name,
        memo_changed=requested.memo and payload.memo != pin.memo,
        new_visited=new_visited,
        new_archived=new_archived,
        visited_changed=new_visited is not None and new_visited != pin.visited,
        archived_changed=new_archived is not None and new_archived != pin.archived,
        from_sanpo_map_id=pin.sanpo_map_id,
        moved_to_sanpo_map_id=(
            target if target is not None and target != pin.sanpo_map_id else None
        ),
    )
