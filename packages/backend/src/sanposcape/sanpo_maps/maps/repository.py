import uuid
import zlib
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import Select, and_, case, func, select, update
from sqlalchemy.dialects.postgresql import aggregate_order_by, array_agg
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from sanposcape.sanpo_maps.advisory_locks import advisory_lock_key
from sanposcape.sanpo_maps.models import (
    DEFAULT_SANPO_MAP_ICON,
    Pin,
    PinPhoto,
    PinTag,
    SanpoMap,
    SanpoMapIcon,
    SanpoMapMember,
)

#: `pg_advisory_xact_lock(key1 int, key2 int)` の namespace（key1）。`photos/repository.py`
#: の `_PIN_PHOTO_UPLOAD_LOCK_NAMESPACE` とは別の固定値にする（衝突回避, ADR-009 決定27）。
#: 値はロックキーそのもの。モジュールパスではないので、ファイルを移動しても変えない
#: （ADR-011）。
_SANPO_MAP_OWNER_LOCK_NAMESPACE = zlib.crc32(b"sanposcape.sanpo_maps.owner") & 0x7FFFFFFF

#: `promote_latest_to_default()` が候補を選び直す回数の上限（無限ループ防止）。
_PROMOTE_MAX_ATTEMPTS = 10


@dataclass(frozen=True)
class SanpoMapTagSummary:
    """`list_tag_summaries()` の1行（`label_key` 単位の集計結果）。

    `label_key`・`last_used_at` は API には出さないが、並び順をテストで検証できるように返す。
    """

    label: str
    label_key: str
    pin_count: int
    last_used_at: datetime


class SanpoMapRepository:
    """sanpo_maps / sanpo_map_members への DB アクセスを隔離する層。

    member 判定を伴う読み取り（`list_for_member`/`get_membership`/`list_tag_summaries` 等）は
    `user_id` を必須引数に取り、`sanpo_map_members` との JOIN で絞る（ID だけで引ける口を
    作らない。ADR-003 決定6 と同じ構造的な IDOR 対策）。`count_pins_for_maps` /
    `list_photo_keys_for_map` のように認可済みの ID を受け取るものは、その旨を各 docstring
    に明記している。
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    def lock_owner(self, owner_user_id: uuid.UUID) -> None:
        """owner 単位の advisory lock を取る（既定地図の不変条件を守るための直列化,
        ADR-009 決定27）。`create_map`/`delete_map` の先頭（他の SELECT より前）で呼ぶこと。

        トランザクションスコープ（`pg_advisory_xact_lock`）なので、呼び出し元の
        commit/rollback で自動的に解放される（`PinPhotoUploadRepository.acquire_user_lock()`
        と同じ形）。
        """
        self._db.execute(
            select(
                func.pg_advisory_xact_lock(
                    _SANPO_MAP_OWNER_LOCK_NAMESPACE, advisory_lock_key(owner_user_id)
                )
            )
        )

    def list_for_member(self, *, user_id: uuid.UUID) -> list[tuple[SanpoMap, str]]:
        """自分が member である地図を「自分の既定地図」→ `updated_at DESC, id DESC` で返す。

        「自分の既定地図か」は `is_default AND owner_user_id == user_id`（B-D2）。
        """
        is_default_for_me = case(
            (and_(SanpoMap.is_default, SanpoMap.owner_user_id == user_id), 1),
            else_=0,
        )
        stmt = (
            select(SanpoMap, SanpoMapMember.role)
            .join(SanpoMapMember, SanpoMapMember.sanpo_map_id == SanpoMap.id)
            .where(SanpoMapMember.user_id == user_id)
            .order_by(is_default_for_me.desc(), SanpoMap.updated_at.desc(), SanpoMap.id.desc())
        )
        return [(row[0], row[1]) for row in self._db.execute(stmt).all()]

    @staticmethod
    def _membership_stmt(*, user_id: uuid.UUID, sanpo_map_id: uuid.UUID) -> Select:
        return (
            select(SanpoMap, SanpoMapMember.role)
            .join(SanpoMapMember, SanpoMapMember.sanpo_map_id == SanpoMap.id)
            .where(SanpoMapMember.user_id == user_id, SanpoMap.id == sanpo_map_id)
        )

    def get_membership(
        self, *, user_id: uuid.UUID, sanpo_map_id: uuid.UUID
    ) -> tuple[SanpoMap, str] | None:
        row = self._db.execute(
            self._membership_stmt(user_id=user_id, sanpo_map_id=sanpo_map_id)
        ).first()
        return None if row is None else (row[0], row[1])

    def get_membership_for_update(
        self, *, user_id: uuid.UUID, sanpo_map_id: uuid.UUID
    ) -> tuple[SanpoMap, str] | None:
        """member 判定込みで地図を取得し、`sanpo_maps` 行を `FOR UPDATE` でロックする
        （`PATCH`/`DELETE /sanpo-maps/{sanpo_map_id}` 用, ADR-009 決定26）。

        `get_membership()` と同じ JOIN に `with_for_update(of=SanpoMap)` を足しただけ
        （`PinRepository._member_pin_stmt`/`get_for_member_for_update()` と同じ形）。
        二重 DELETE の後発はロック待ちの後に行が無いため 404 になる。
        """
        stmt = self._membership_stmt(user_id=user_id, sanpo_map_id=sanpo_map_id).with_for_update(
            of=SanpoMap
        )
        row = self._db.execute(stmt).first()
        return None if row is None else (row[0], row[1])

    def get_default_for_owner(self, *, owner_user_id: uuid.UUID) -> SanpoMap | None:
        stmt = select(SanpoMap).where(SanpoMap.owner_user_id == owner_user_id, SanpoMap.is_default)
        return self._db.scalars(stmt).first()

    def _insert_map_and_owner(
        self, *, owner_user_id: uuid.UUID, name: str, is_default: bool, icon: SanpoMapIcon
    ) -> SanpoMap:
        """地図と owner の member 行を1組 INSERT する private ヘルパー（`create_with_owner()`・
        `create_owned()` で共有する。不変条件: owner の member 行はちょうど1つで
        `owner_user_id` と一致する）。呼び出し元が savepoint（`db.begin_nested()`）で
        囲むこと。
        """
        sanpo_map = SanpoMap(
            owner_user_id=owner_user_id, name=name, is_default=is_default, icon=icon.value
        )
        self._db.add(sanpo_map)
        self._db.flush()
        self._db.add(SanpoMapMember(sanpo_map_id=sanpo_map.id, user_id=owner_user_id, role="owner"))
        self._db.flush()
        return sanpo_map

    def create_with_owner(
        self, *, owner_user_id: uuid.UUID, name: str, is_default: bool
    ) -> tuple[SanpoMap, bool]:
        """地図を新規作成し、owner の member 行も同時に作る。戻り値は `(sanpo_map, created)`。

        `POST /pins`（`sanpo_map_id` 省略時の「最初の地図」自動作成）専用。作る地図は既定の
        アイコン（pin）にする（決定31）。`is_default=True` での同時作成は
        `uq_sanpo_maps_owner_user_id_is_default`（部分一意インデックス）により片方が
        `IntegrityError` になる。`users/repository.py` と同じ savepoint
        パターン（`db.begin_nested()`）で捕捉し、既存の既定地図を再取得して返す
        （`created=False`）。savepoint を使う理由も同様: 素の `db.rollback()` は呼び出し元
        （`PinService.create_pin`）が張っている外側のトランザクション全体を巻き戻して
        しまうため。
        """
        try:
            with self._db.begin_nested():
                sanpo_map = self._insert_map_and_owner(
                    owner_user_id=owner_user_id,
                    name=name,
                    is_default=is_default,
                    icon=DEFAULT_SANPO_MAP_ICON,
                )
        except IntegrityError:
            if not is_default:
                # 部分一意インデックスは is_default にしか効かないため、他の一意制約
                # 違反は理論上あり得ないはずだが、万一に備えて再送出する。
                raise
            existing = self.get_default_for_owner(owner_user_id=owner_user_id)
            if existing is None:
                raise
            return existing, False
        self._db.refresh(sanpo_map)
        return sanpo_map, True

    def create_owned(
        self,
        *,
        owner_user_id: uuid.UUID,
        name: str,
        prefer_default: bool,
        icon: SanpoMapIcon = DEFAULT_SANPO_MAP_ICON,
    ) -> SanpoMap:
        """`POST /sanpo-maps` 用に新しい地図を1件作成する（ADR-009 決定25・27）。

        `create_with_owner()` と異なり、常に新しい行を作る（既存の既定地図への
        フォールバックはしない）。`prefer_default=True` は「呼び出し元が確認した時点で
        自分の既定地図が無かった」ときに渡す。それでも `POST /pins` の「最初の地図」
        自動作成と同時に走ると一意違反になりうるため、savepoint で捕捉し、新しい
        savepoint で `is_default=False` として作り直す（誰かが既に既定を作った =
        「owner ごとに既定地図はちょうど1つ」という不変条件は満たされる, 決定27）。
        """
        if prefer_default:
            try:
                with self._db.begin_nested():
                    sanpo_map = self._insert_map_and_owner(
                        owner_user_id=owner_user_id, name=name, is_default=True, icon=icon
                    )
            except IntegrityError:
                pass
            else:
                self._db.refresh(sanpo_map)
                return sanpo_map
        with self._db.begin_nested():
            sanpo_map = self._insert_map_and_owner(
                owner_user_id=owner_user_id, name=name, is_default=False, icon=icon
            )
        self._db.refresh(sanpo_map)
        return sanpo_map

    def update_name(self, sanpo_map: SanpoMap, *, name: str) -> None:
        """名前を変更して flush する（`PATCH /sanpo-maps/{id}`）。`updated_at` は触らない
        （決定23 と同じ考え方: `updated_at` は「最近ピンを追加した地図」の並び順専用で、
        名前変更では動かさない, 決定25）。
        """
        sanpo_map.name = name
        self._db.flush()

    def update_icon(self, sanpo_map: SanpoMap, *, icon: SanpoMapIcon) -> None:
        """アイコンを変更して flush する（`PATCH /sanpo-maps/{id}`）。`updated_at` は触らない
        （名前変更と同じ。「最近ピンを追加した地図」の並び順専用, 決定25・31）。
        """
        sanpo_map.icon = icon.value
        self._db.flush()

    def delete(self, sanpo_map: SanpoMap) -> None:
        """地図を削除する。子（`sanpo_map_members`/`pins` 等）は DB の `ON DELETE CASCADE`
        で消える（`relationship()` を張っていないため ORM の cascade は効かない。commit
        前に同じセッションで子エンティティを触らないこと。`PinRepository.delete_pin()`
        と同じ注意, 決定28）。
        """
        self._db.delete(sanpo_map)
        self._db.flush()

    def _select_promotion_candidate(
        self, *, owner_user_id: uuid.UUID, excluded_ids: list[uuid.UUID]
    ) -> uuid.UUID | None:
        stmt = select(SanpoMap.id).where(SanpoMap.owner_user_id == owner_user_id)
        if excluded_ids:
            stmt = stmt.where(SanpoMap.id.not_in(excluded_ids))
        stmt = stmt.order_by(SanpoMap.updated_at.desc(), SanpoMap.id.desc()).limit(1)
        return self._db.scalar(stmt)

    def promote_latest_to_default(self, *, owner_user_id: uuid.UUID) -> uuid.UUID | None:
        """既定地図を削除した直後に、残りの自分の地図のうち `updated_at DESC, id DESC` の
        先頭を新しい既定へ繰り上げる（`list_for_member()` と同じ並び順, 決定27）。

        呼び出し元（`SanpoMapService.delete_map`）が `lock_owner()` を既に取っている前提
        だが、それでも防御的に rowcount を確認する: 候補行が選定後に消えていた場合
        （UPDATE の rowcount が0）、その候補を除いて選び直す（上限
        `_PROMOTE_MAX_ATTEMPTS` 回、advisory lock が効いていれば通常は1回で終わる）。
        残りが無ければ `None`（既定なしのまま。次の `POST /pins` が「最初の地図」で
        回復する）。savepoint で一意違反（同時に誰かが既定を作った）を捕捉したら諦めて
        `None` を返す（誰かが既定を作った = 不変条件は満たされる）。
        """
        excluded_ids: list[uuid.UUID] = []
        for _ in range(_PROMOTE_MAX_ATTEMPTS):
            candidate_id = self._select_promotion_candidate(
                owner_user_id=owner_user_id, excluded_ids=excluded_ids
            )
            if candidate_id is None:
                return None
            try:
                with self._db.begin_nested():
                    result = self._db.execute(
                        update(SanpoMap).where(SanpoMap.id == candidate_id).values(is_default=True)
                    )
            except IntegrityError:
                return None
            if result.rowcount > 0:
                return candidate_id
            excluded_ids.append(candidate_id)
        return None

    def touch(self, *, sanpo_map_id: uuid.UUID, now: datetime) -> None:
        """ピン追加時に `updated_at` を更新する（「最近使った地図」を先頭にする並び順に使う）。"""
        self._db.execute(update(SanpoMap).where(SanpoMap.id == sanpo_map_id).values(updated_at=now))

    def list_photo_keys_for_map(self, sanpo_map_id: uuid.UUID) -> list[tuple[str, str | None]]:
        """地図に属する全ピンの写真の `(s3_key, thumbnail_s3_key)` を列だけ取る
        （地図削除時, ADR-009 決定28）。`PinRepository.list_photo_keys(pin_id)` と同じ
        戻り値の形。
        """
        stmt = (
            select(PinPhoto.s3_key, PinPhoto.thumbnail_s3_key)
            .join(Pin, Pin.id == PinPhoto.pin_id)
            .where(Pin.sanpo_map_id == sanpo_map_id)
        )
        return [(row[0], row[1]) for row in self._db.execute(stmt).all()]

    def count_pins_for_maps(self, sanpo_map_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
        """各地図のピン件数をまとめて取得する（`GET /sanpo-maps?expand=pin_count` 用,
        ADR-009 決定29）。0件の地図は dict に入らない（呼び出し側は `.get(id, 0)` にする。
        `PinRepository.count_photos_for_pins()` と同じ形）。

        `sanpo_map_ids` は認可済み（`list_for_member()` を通して member であることを
        確認済み）のものを渡すこと。
        """
        if not sanpo_map_ids:
            return {}
        stmt = (
            select(Pin.sanpo_map_id, func.count())
            .where(Pin.sanpo_map_id.in_(sanpo_map_ids))
            .group_by(Pin.sanpo_map_id)
        )
        return dict(self._db.execute(stmt).all())

    def list_tag_summaries(
        self, *, user_id: uuid.UUID, sanpo_map_id: uuid.UUID, limit: int
    ) -> list[SanpoMapTagSummary]:
        """地図内の全ピンのタグを `label_key` 単位に集計して上位 `limit` 件返す
        （`GET /sanpo-maps/{sanpo_map_id}/tags` 用, ADR-009 SS-136 追補 決定30）。

        - 並び順: `pin_count DESC` → `last_used_at`（`MAX(pin_tags.created_at)`）`DESC`
          → `label_key ASC`（`COLLATE "C"` = バイト順。DB の collation に依存させず
          決定的にする）。
        - `label`（代表表記）: 同じ `label_key` の行のうち `created_at DESC, id DESC` の
          先頭。同一トランザクションの INSERT は `created_at` が同値になりうるので、`id`
          を補助キーにして決定的にする。
        - `pin_count` は `count(*)`。`UNIQUE(pin_id, label_key)` により1ピン1行なので行数
          がピン数になる（この制約が前提）。
        - 集計対象は作成者を問わない全ピン。`sanpo_map_members` を `user_id` で JOIN して
          絞るので、非メンバーの `user_id` では空になる（`(sanpo_map_id, user_id)` が PK
          のため行は増えず、count は水増しされない）。
        - `limit` は 1〜`SANPO_MAP_TAG_LIST_MAX_LIMIT`（Router の `Query` で検証済み）。
          ここでは再検証しない。
        - `PinTag` は maps 外のテーブルだが、読み取りの JOIN・集計なので可（ADR-011 M6）。
        """
        # PostgreSQL の配列は 1 始まり。SQLAlchemy の ARRAY は zero_indexes=False が既定で
        # `[1]` がそのまま `[1]` として出る。
        label_col = array_agg(
            aggregate_order_by(PinTag.label, PinTag.created_at.desc(), PinTag.id.desc())
        )[1].label("label")
        pin_count_col = func.count().label("pin_count")
        last_used_col = func.max(PinTag.created_at).label("last_used_at")
        stmt = (
            select(PinTag.label_key, label_col, pin_count_col, last_used_col)
            .join(Pin, Pin.id == PinTag.pin_id)
            .join(SanpoMapMember, SanpoMapMember.sanpo_map_id == Pin.sanpo_map_id)
            .where(Pin.sanpo_map_id == sanpo_map_id, SanpoMapMember.user_id == user_id)
            .group_by(PinTag.label_key)
            .order_by(
                pin_count_col.desc(), last_used_col.desc(), PinTag.label_key.collate("C").asc()
            )
            .limit(limit)
        )
        return [
            SanpoMapTagSummary(
                label=row.label,
                label_key=row.label_key,
                pin_count=row.pin_count,
                last_used_at=row.last_used_at,
            )
            for row in self._db.execute(stmt).all()
        ]
