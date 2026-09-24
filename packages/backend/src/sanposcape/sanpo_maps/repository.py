import uuid
from datetime import datetime

from sqlalchemy import and_, case, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from sanposcape.sanpo_maps.models import SanpoMap, SanpoMapMember


class SanpoMapRepository:
    """sanpo_maps / sanpo_map_members への DB アクセスを隔離する層。

    読み取り系のメソッドはすべて `user_id` を必須引数に取り、`sanpo_map_members` との
    JOIN で絞る（ID だけで引ける口を作らない。ADR-003 決定6 と同じ構造的な IDOR 対策）。
    """

    def __init__(self, db: Session) -> None:
        self._db = db

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

    def get_membership(
        self, *, user_id: uuid.UUID, sanpo_map_id: uuid.UUID
    ) -> tuple[SanpoMap, str] | None:
        stmt = (
            select(SanpoMap, SanpoMapMember.role)
            .join(SanpoMapMember, SanpoMapMember.sanpo_map_id == SanpoMap.id)
            .where(SanpoMapMember.user_id == user_id, SanpoMap.id == sanpo_map_id)
        )
        row = self._db.execute(stmt).first()
        return None if row is None else (row[0], row[1])

    def get_default_for_owner(self, *, owner_user_id: uuid.UUID) -> SanpoMap | None:
        stmt = select(SanpoMap).where(SanpoMap.owner_user_id == owner_user_id, SanpoMap.is_default)
        return self._db.scalars(stmt).first()

    def create_with_owner(
        self, *, owner_user_id: uuid.UUID, name: str, is_default: bool
    ) -> tuple[SanpoMap, bool]:
        """地図を新規作成し、owner の member 行も同時に作る（不変条件: owner の member 行は
        ちょうど1つで `owner_user_id` と一致する）。戻り値は `(sanpo_map, created)`。

        `is_default=True` での同時作成は `uq_sanpo_maps_owner_user_id_is_default`
        （部分一意インデックス）により片方が `IntegrityError` になる。`users/repository.py`
        と同じ savepoint パターン（`db.begin_nested()`）で捕捉し、既存の既定地図を
        再取得して返す（`created=False`）。savepoint を使う理由も同様: 素の
        `db.rollback()` は呼び出し元（`PinService.create_pin`）が張っている外側の
        トランザクション全体を巻き戻してしまうため。
        """
        sanpo_map = SanpoMap(owner_user_id=owner_user_id, name=name, is_default=is_default)
        try:
            with self._db.begin_nested():
                self._db.add(sanpo_map)
                self._db.flush()
                self._db.add(
                    SanpoMapMember(sanpo_map_id=sanpo_map.id, user_id=owner_user_id, role="owner")
                )
                self._db.flush()
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

    def touch(self, *, sanpo_map_id: uuid.UUID, now: datetime) -> None:
        """ピン追加時に `updated_at` を更新する（「最近使った地図」を先頭にする並び順に使う）。"""
        self._db.execute(update(SanpoMap).where(SanpoMap.id == sanpo_map_id).values(updated_at=now))
