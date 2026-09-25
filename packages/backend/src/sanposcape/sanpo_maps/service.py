import logging
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from sanposcape.sanpo_maps.contents import SanpoMapContents
from sanposcape.sanpo_maps.exceptions import SanpoMapNotFoundError, SanpoMapPermissionDeniedError
from sanposcape.sanpo_maps.mappers import to_sanpo_map_read
from sanposcape.sanpo_maps.models import SanpoMap
from sanposcape.sanpo_maps.permissions import can_delete_sanpo_map, can_update_sanpo_map
from sanposcape.sanpo_maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.schemas import (
    SanpoMapCreate,
    SanpoMapListRead,
    SanpoMapRead,
    SanpoMapRole,
    SanpoMapUpdate,
)
from sanposcape.users.models import User

logger = logging.getLogger(__name__)

#: `sanpo_map_id` 省略時、地図を持たないユーザーに同一トランザクションで作られる地図の名前。
#: mobile の同名定数（`FIRST_SANPO_MAP_NAME`）と一致させる（backend-plan.md 5.8）。
FIRST_SANPO_MAP_NAME = "最初の地図"


@dataclass(frozen=True)
class ResolvedSanpoMap:
    """ピン作成のために解決された地図と、リクエストユーザーの role。"""

    sanpo_map: SanpoMap
    role: SanpoMapRole


class SanpoMapService:
    """地図(SanpoMap)に関するユースケース。

    `pins → sanpo_maps` の一方向依存を保つため、この service は `pins` を import しない
    （ADR-009 決定29）。`pins` の情報（ピン件数の集計・削除時の写真後始末）が必要な操作は
    `sanpo_maps/contents.py` の `SanpoMapContents` port をメソッド引数で受け取る
    （実装は `PinService` が満たし、配線はアプリ直下 `dependencies.py`、ADR-009 決定29）。

    トランザクション境界（commit）: `resolve_map_for_new_pin`/`mark_used` は呼び出し元
    （`PinService`）が commit する（ピン作成と同じトランザクションにするため）。
    `list_maps` は読み取り専用なので commit しない。`create_map`/`update_map`/`delete_map`
    は自分で commit する。
    """

    def __init__(
        self,
        db: Session,
        repository: SanpoMapRepository,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._db = db
        self._repository = repository
        self._now = now

    def list_maps(
        self, current_user: User, *, pin_counter: SanpoMapContents | None = None
    ) -> SanpoMapListRead:
        """自分が member である地図を全件返す。

        `pin_counter` を渡すと（`?expand=pin_count`）、認可済みの全 ID をまとめて1回だけ
        `count_pins_for_sanpo_maps()` に渡し、ピンが無い地図は0として埋める。渡さなければ
        全要素 `pin_count=None`（ADR-009 決定29）。
        """
        rows = self._repository.list_for_member(user_id=current_user.id)
        pin_counts: dict[uuid.UUID, int] = {}
        if pin_counter is not None:
            pin_counts = pin_counter.count_pins_for_sanpo_maps(
                [sanpo_map.id for sanpo_map, _role in rows]
            )
        items = [
            to_sanpo_map_read(
                sanpo_map,
                role=role,
                current_user_id=current_user.id,
                pin_count=pin_counts.get(sanpo_map.id, 0) if pin_counter is not None else None,
            )
            for sanpo_map, role in rows
        ]
        return SanpoMapListRead(items=items, next_cursor=None)

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

    def mark_used(self, sanpo_map_id: uuid.UUID) -> None:
        """ピン追加時に地図の `updated_at` を更新する（commit しない）。"""
        self._repository.touch(sanpo_map_id=sanpo_map_id, now=self._now())

    def create_map(self, current_user: User, payload: SanpoMapCreate) -> SanpoMapRead:
        """`POST /sanpo-maps`: 地図を新規作成する（ADR-009 決定25・27）。

        自分の既定地図がまだ無ければ、作った地図を既定にする（`is_default` はリクエスト
        では受け取らない）。`POST /pins` の「最初の地図」自動作成と競合した場合は
        `create_owned()` 側で非既定として作り直される。
        """
        prefer_default = (
            self._repository.get_default_for_owner(owner_user_id=current_user.id) is None
        )
        sanpo_map = self._repository.create_owned(
            owner_user_id=current_user.id, name=payload.name, prefer_default=prefer_default
        )
        self._db.commit()
        return to_sanpo_map_read(sanpo_map, role="owner", current_user_id=current_user.id)

    def update_map(
        self, current_user: User, sanpo_map_id: uuid.UUID, payload: SanpoMapUpdate
    ) -> SanpoMapRead:
        """`PATCH /sanpo-maps/{sanpo_map_id}`: 名前を変更する（ADR-009 決定25・26）。

        判定順は決定21と同じ「member（404）→ 権限（403）」。権限は「送られたフィールド」
        （ここでは `name` のみ）で判定するため、`{}` は member 判定だけで 200 になる
        （editor でも可）。`name` を送ったときだけ `can_update_sanpo_map` を見る。
        """
        membership = self._repository.get_membership_for_update(
            user_id=current_user.id, sanpo_map_id=sanpo_map_id
        )
        if membership is None:
            raise SanpoMapNotFoundError()
        sanpo_map, role = membership

        if "name" in payload.model_fields_set:
            if not can_update_sanpo_map(role):
                raise SanpoMapPermissionDeniedError()
            if payload.name is None:
                # `SanpoMapUpdate` の model_validator が明示 null を弾いているため
                # 到達しないはずの不変条件違反。
                raise AssertionError("payload.name must not be None when 'name' is set")
            if payload.name != sanpo_map.name:
                self._repository.update_name(sanpo_map, name=payload.name)

        self._db.commit()
        return to_sanpo_map_read(sanpo_map, role=role, current_user_id=current_user.id)

    def delete_map(
        self, current_user: User, sanpo_map_id: uuid.UUID, *, contents: SanpoMapContents
    ) -> None:
        """`DELETE /sanpo-maps/{sanpo_map_id}`: 地図を削除する（ADR-009 決定28）。

        手順: 地図行を `FOR UPDATE` でロックして member・role を読み直す → 権限確認 →
        `contents.prepare_sanpo_map_deletion()` で写真キーを集める（認可・ロックの後）→
        DB 削除・既定地図の繰り上げ・commit → best-effort な後始末（commit 後、例外を
        出さない）。非冪等（2回目は 404）。
        """
        membership = self._repository.get_membership_for_update(
            user_id=current_user.id, sanpo_map_id=sanpo_map_id
        )
        if membership is None:
            raise SanpoMapNotFoundError()
        sanpo_map, role = membership
        if not can_delete_sanpo_map(role):
            raise SanpoMapPermissionDeniedError()

        cleanup = contents.prepare_sanpo_map_deletion(sanpo_map_id)

        # commit 前に控える（R2: commit 後は expire_on_commit により ORM 属性へのアクセスが
        # 不要な SELECT を招きうるため、SS-112 の `PinService.delete_pin` と同じ流儀）。
        was_default = sanpo_map.is_default
        owner_user_id = sanpo_map.owner_user_id
        user_id = current_user.id

        self._repository.delete(sanpo_map)
        promoted_sanpo_map_id: uuid.UUID | None = None
        if was_default:
            promoted_sanpo_map_id = self._repository.promote_latest_to_default(
                owner_user_id=owner_user_id
            )
        self._db.commit()

        logger.info(
            "Sanpo map deleted: sanpo_map_id=%s by user_id=%s promoted_default_sanpo_map_id=%s",
            sanpo_map_id,
            user_id,
            promoted_sanpo_map_id,
        )
        cleanup()
