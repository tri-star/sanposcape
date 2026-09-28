import uuid
import zlib
from datetime import datetime

from sqlalchemy import Select, and_, case, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from sanposcape.sanpo_maps.models import SanpoMap, SanpoMapMember

#: `pg_advisory_xact_lock(key1 int, key2 int)` の namespace（key1）。`pins/repository.py`
#: の `_PIN_PHOTO_UPLOAD_LOCK_NAMESPACE` とは別の固定値にする（衝突回避, ADR-009 決定27）。
_SANPO_MAP_OWNER_LOCK_NAMESPACE = zlib.crc32(b"sanposcape.sanpo_maps.owner") & 0x7FFFFFFF

#: `promote_latest_to_default()` が候補を選び直す回数の上限（無限ループ防止）。
_PROMOTE_MAX_ATTEMPTS = 10


def _advisory_lock_key(user_id: uuid.UUID) -> int:
    """UUID を `pg_advisory_xact_lock` の signed int4 キーへ畳み込む（決定的・プロセス非依存）。

    `pins/repository.py` の同名関数と同じ内容。`sanpo_maps` は `pins` を import しない
    （ADR-009 決定29）ため、共通化はせず暫定でこの関数を複製している（sanpo_maps と pins を
    同じコンテキスト境界に統合するかは別途検討中）。
    """
    raw = user_id.int
    key = 0
    for shift in range(0, 128, 32):
        key ^= (raw >> shift) & 0xFFFFFFFF
    if key >= 2**31:
        key -= 2**32
    return key


class SanpoMapRepository:
    """sanpo_maps / sanpo_map_members への DB アクセスを隔離する層。

    読み取り系のメソッドはすべて `user_id` を必須引数に取り、`sanpo_map_members` との
    JOIN で絞る（ID だけで引ける口を作らない。ADR-003 決定6 と同じ構造的な IDOR 対策）。
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
                    _SANPO_MAP_OWNER_LOCK_NAMESPACE, _advisory_lock_key(owner_user_id)
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
        self, *, owner_user_id: uuid.UUID, name: str, is_default: bool
    ) -> SanpoMap:
        """地図と owner の member 行を1組 INSERT する private ヘルパー（`create_with_owner()`・
        `create_owned()` で共有する。不変条件: owner の member 行はちょうど1つで
        `owner_user_id` と一致する）。呼び出し元が savepoint（`db.begin_nested()`）で
        囲むこと。
        """
        sanpo_map = SanpoMap(owner_user_id=owner_user_id, name=name, is_default=is_default)
        self._db.add(sanpo_map)
        self._db.flush()
        self._db.add(SanpoMapMember(sanpo_map_id=sanpo_map.id, user_id=owner_user_id, role="owner"))
        self._db.flush()
        return sanpo_map

    def create_with_owner(
        self, *, owner_user_id: uuid.UUID, name: str, is_default: bool
    ) -> tuple[SanpoMap, bool]:
        """地図を新規作成し、owner の member 行も同時に作る。戻り値は `(sanpo_map, created)`。

        `POST /pins`（`sanpo_map_id` 省略時の「最初の地図」自動作成）専用。`is_default=True`
        での同時作成は `uq_sanpo_maps_owner_user_id_is_default`（部分一意インデックス）に
        より片方が `IntegrityError` になる。`users/repository.py` と同じ savepoint
        パターン（`db.begin_nested()`）で捕捉し、既存の既定地図を再取得して返す
        （`created=False`）。savepoint を使う理由も同様: 素の `db.rollback()` は呼び出し元
        （`PinService.create_pin`）が張っている外側のトランザクション全体を巻き戻して
        しまうため。
        """
        try:
            with self._db.begin_nested():
                sanpo_map = self._insert_map_and_owner(
                    owner_user_id=owner_user_id, name=name, is_default=is_default
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
        self, *, owner_user_id: uuid.UUID, name: str, prefer_default: bool
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
                        owner_user_id=owner_user_id, name=name, is_default=True
                    )
            except IntegrityError:
                pass
            else:
                self._db.refresh(sanpo_map)
                return sanpo_map
        with self._db.begin_nested():
            sanpo_map = self._insert_map_and_owner(
                owner_user_id=owner_user_id, name=name, is_default=False
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
