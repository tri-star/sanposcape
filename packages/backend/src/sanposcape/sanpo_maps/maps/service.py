import logging
import uuid

from sqlalchemy.orm import Session

from sanposcape.sanpo_maps.exceptions import SanpoMapNotFoundError, SanpoMapPermissionDeniedError
from sanposcape.sanpo_maps.maps.mappers import to_sanpo_map_read
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.maps.schemas import (
    SanpoMapCreate,
    SanpoMapListRead,
    SanpoMapRead,
    SanpoMapTagListRead,
    SanpoMapTagRead,
    SanpoMapUpdate,
)
from sanposcape.sanpo_maps.permissions import can_delete_sanpo_map, can_update_sanpo_map
from sanposcape.sanpo_maps.photos.cleanup import PhotoObjectCleaner, flatten_photo_keys
from sanposcape.users.models import User

logger = logging.getLogger(__name__)


class SanpoMapService:
    """地図(SanpoMap)に関するユースケース。

    他の Service を import・保持・呼び出ししない（ADR-011 M3）。地図の中身（ピン件数）の
    集計・写真キー収集は `SanpoMapRepository`、S3 の後始末は `PhotoObjectCleaner` を使う
    （ADR-011）。

    トランザクション境界（commit）: `list_maps`/`list_tags` は読み取り専用なので commit しない。
    `create_map`/`update_map`/`delete_map` は自分で commit する。
    """

    def __init__(
        self,
        db: Session,
        repository: SanpoMapRepository,
        photo_cleaner: PhotoObjectCleaner,
    ) -> None:
        self._db = db
        self._repository = repository
        self._photo_cleaner = photo_cleaner

    def list_maps(self, current_user: User, *, include_pin_count: bool = False) -> SanpoMapListRead:
        """自分が member である地図を全件返す。

        `include_pin_count=True` のとき（`?expand=pin_count`）、認可済みの全 ID をまとめて
        1回だけ `count_pins_for_maps()` に渡し、ピンが無い地図は0として埋める。`False` なら
        全要素 `pin_count=None`（ADR-009 決定29）。
        """
        rows = self._repository.list_for_member(user_id=current_user.id)
        pin_counts: dict[uuid.UUID, int] = {}
        if include_pin_count:
            pin_counts = self._repository.count_pins_for_maps(
                [sanpo_map.id for sanpo_map, _role in rows]
            )
        items = [
            to_sanpo_map_read(
                sanpo_map,
                role=role,
                current_user_id=current_user.id,
                pin_count=pin_counts.get(sanpo_map.id, 0) if include_pin_count else None,
            )
            for sanpo_map, role in rows
        ]
        return SanpoMapListRead(items=items, next_cursor=None)

    def list_tags(
        self, current_user: User, sanpo_map_id: uuid.UUID, *, limit: int
    ) -> SanpoMapTagListRead:
        """`GET /sanpo-maps/{sanpo_map_id}/tags`: 地図内のタグを `label_key` 単位に集計して
        返す（ADR-009 SS-136 追補 決定30）。

        member（owner / editor）なら可。非メンバー・存在しない ID は区別せず 404
        （決定9・21）。読み取りのみで role による拒否は無いので `permissions.py` には
        関数を足さない。`limit` は 1〜`SANPO_MAP_TAG_LIST_MAX_LIMIT`（Router で検証済み）。
        集計は Repository のクエリ側でも member JOIN で絞る（多重防御）。
        """
        membership = self._repository.get_membership(
            user_id=current_user.id, sanpo_map_id=sanpo_map_id
        )
        if membership is None:
            raise SanpoMapNotFoundError()
        rows = self._repository.list_tag_summaries(
            user_id=current_user.id, sanpo_map_id=sanpo_map_id, limit=limit
        )
        return SanpoMapTagListRead(
            items=[SanpoMapTagRead(label=row.label, pin_count=row.pin_count) for row in rows]
        )

    def create_map(self, current_user: User, payload: SanpoMapCreate) -> SanpoMapRead:
        """`POST /sanpo-maps`: 地図を新規作成する（ADR-009 決定25・27・31）。`icon` は省略時 pin。

        自分の既定地図がまだ無ければ、作った地図を既定にする（`is_default` はリクエスト
        では受け取らない）。既定の有無の判定から作成・commit までを owner 単位の
        advisory lock（`lock_owner()`）で直列化する（`delete_map` と同じロックを取るため、
        既定地図の削除と本操作が交差して「既定が0」になることを防ぐ, 決定27）。
        `POST /pins` の「最初の地図」自動作成（`resolve_map_for_new_pin`）はこのロックを
        取らないが、部分一意インデックスが「既定が2つ」の方向を防ぐため、既定が消える
        方向のバグは起きない（決定27）。
        """
        self._repository.lock_owner(current_user.id)
        prefer_default = (
            self._repository.get_default_for_owner(owner_user_id=current_user.id) is None
        )
        sanpo_map = self._repository.create_owned(
            owner_user_id=current_user.id,
            name=payload.name,
            prefer_default=prefer_default,
            icon=payload.icon,
        )
        self._db.commit()
        return to_sanpo_map_read(sanpo_map, role="owner", current_user_id=current_user.id)

    def update_map(
        self, current_user: User, sanpo_map_id: uuid.UUID, payload: SanpoMapUpdate
    ) -> SanpoMapRead:
        """`PATCH /sanpo-maps/{sanpo_map_id}`: 名前・アイコンを変更する（ADR-009 決定25・26・31）。

        判定順は決定21と同じ「member（404）→ 権限（403）」。権限は「送られたフィールド」
        （`name`/`icon`）で判定するため、`{}` は member 判定だけで 200 になる（editor でも可）。
        どちらかを送ったら `can_update_sanpo_map` を見る（editor が今と同じ値を送っても 403）。
        権限判定はフィールドごとの更新より前にまとめる（一部だけ更新される状態を作らない）。
        `updated_at` は更新しない（決定25・31）。
        """
        membership = self._repository.get_membership_for_update(
            user_id=current_user.id, sanpo_map_id=sanpo_map_id
        )
        if membership is None:
            raise SanpoMapNotFoundError()
        sanpo_map, role = membership

        requested = payload.model_fields_set & {"name", "icon"}
        if requested and not can_update_sanpo_map(role):
            raise SanpoMapPermissionDeniedError()

        if "name" in requested:
            if payload.name is None:
                # `SanpoMapUpdate` の model_validator が明示 null を弾いているため
                # 到達しないはずの不変条件違反。
                raise AssertionError("payload.name must not be None when 'name' is set")
            if payload.name != sanpo_map.name:
                self._repository.update_name(sanpo_map, name=payload.name)
        if "icon" in requested:
            if payload.icon is None:
                raise AssertionError("payload.icon must not be None when 'icon' is set")
            if payload.icon != sanpo_map.icon:
                self._repository.update_icon(sanpo_map, icon=payload.icon)

        self._db.commit()
        return to_sanpo_map_read(sanpo_map, role=role, current_user_id=current_user.id)

    def delete_map(self, current_user: User, sanpo_map_id: uuid.UUID) -> None:
        """`DELETE /sanpo-maps/{sanpo_map_id}`: 地図を削除する（ADR-009 決定28）。

        手順: owner 単位の advisory lock（`lock_owner()`）を取る → 地図行を `FOR UPDATE`
        でロックして member・role を読み直す → 権限確認 → 写真キーを集める（認可・ロックの
        後）→ DB 削除・既定地図の繰り上げ・commit → best-effort な後始末（commit 後、例外を
        出さない）。非冪等（2回目は 404）。

        `lock_owner()` は「owner → 地図行」の順で取る（`create_map` と同じ順序にして
        デッドロックを防ぐ, 決定27・決定28）。地図の削除は owner にしか許可しない
        （`can_delete_sanpo_map`）ため、`current_user.id` が実際に owner の ID になる。
        editor・非メンバーが呼んでも、自分自身の ID でロックを取るだけで他の操作と
        競合せず、直後の権限確認・404 判定で弾かれるだけなので害はない。
        """
        self._repository.lock_owner(current_user.id)
        membership = self._repository.get_membership_for_update(
            user_id=current_user.id, sanpo_map_id=sanpo_map_id
        )
        if membership is None:
            raise SanpoMapNotFoundError()
        sanpo_map, role = membership
        if not can_delete_sanpo_map(role):
            raise SanpoMapPermissionDeniedError()

        photo_keys = flatten_photo_keys(self._repository.list_photo_keys_for_map(sanpo_map_id))

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
        self._photo_cleaner.delete_best_effort(photo_keys)
