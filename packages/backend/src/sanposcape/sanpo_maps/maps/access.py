import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from sanposcape.sanpo_maps.exceptions import SanpoMapNotFoundError
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.models import SanpoMap
from sanposcape.sanpo_maps.permissions import SanpoMapRole
from sanposcape.users.models import User

#: `sanpo_map_id` 省略時、地図を持たないユーザーに同一トランザクションで作られる地図の名前。
#: mobile の同名定数（`FIRST_SANPO_MAP_NAME`）と一致させる（backend-plan.md 5.8）。
FIRST_SANPO_MAP_NAME = "最初の地図"


@dataclass(frozen=True)
class ResolvedSanpoMap:
    """ピン作成のために解決された地図と、リクエストユーザーの role。"""

    sanpo_map: SanpoMap
    role: SanpoMapRole


class SanpoMapAccess:
    """ピン作成・写真操作のために地図を解決する部品（ADR-011）。

    Session を持たず commit しない。呼び出し元 Service のトランザクションに乗る
    （ADR-011 M3・M4）。
    """

    def __init__(
        self,
        repository: SanpoMapRepository,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._repository = repository
        self._now = now

    def resolve_map_for_new_pin(
        self, current_user: User, sanpo_map_id: uuid.UUID | None
    ) -> ResolvedSanpoMap:
        """ピン作成用に地図を解決する。

        `sanpo_map_id` 指定あり: member 行を確認し、無ければ `SanpoMapNotFoundError`（404）。
        省略: 自分の既定地図を取得し、無ければ同一トランザクションで作成する
        （flush のみ・commit しない。呼び出し元 `PinService.create_pin` が検証失敗時に
        ロールバックできるようにするため。空の地図が残らない、backend-plan.md 5.5）。
        """
        if sanpo_map_id is not None:
            membership = self._repository.get_membership(
                user_id=current_user.id, sanpo_map_id=sanpo_map_id
            )
            if membership is None:
                raise SanpoMapNotFoundError()
            sanpo_map, role = membership
            return ResolvedSanpoMap(sanpo_map=sanpo_map, role=role)

        default_map = self._repository.get_default_for_owner(owner_user_id=current_user.id)
        if default_map is not None:
            return ResolvedSanpoMap(sanpo_map=default_map, role="owner")

        created_map, _created = self._repository.create_with_owner(
            owner_user_id=current_user.id, name=FIRST_SANPO_MAP_NAME, is_default=True
        )
        return ResolvedSanpoMap(sanpo_map=created_map, role="owner")

    def get_role(self, current_user: User, sanpo_map_id: uuid.UUID) -> SanpoMapRole | None:
        """写真追加 API の権限判定用。member でなければ `None`。"""
        membership = self._repository.get_membership(
            user_id=current_user.id, sanpo_map_id=sanpo_map_id
        )
        return None if membership is None else membership[1]

    def get_role_for_pin_move(
        self, current_user: User, sanpo_map_id: uuid.UUID
    ) -> SanpoMapRole | None:
        """ピンの移動先の role を、地図行を `FOR KEY SHARE` でロックして引く（決定33）。
        member でない・存在しない・同時に削除された場合は `None`。commit しない。
        """
        membership = self._repository.get_membership_for_key_share(
            user_id=current_user.id, sanpo_map_id=sanpo_map_id
        )
        return None if membership is None else membership[1]

    def mark_used(self, sanpo_map_id: uuid.UUID) -> None:
        """ピン追加時に地図の `updated_at` を更新する（commit しない）。"""
        self._repository.touch(sanpo_map_id=sanpo_map_id, now=self._now())
