import uuid
import zlib
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from sanposcape.pins.models import Pin, PinPhoto, PinPhotoUpload, PinTag
from sanposcape.pins.photo_attacher import PreparedPhoto
from sanposcape.pins.tag_labels import tag_key
from sanposcape.sanpo_maps.models import SanpoMap, SanpoMapMember

#: `pg_advisory_xact_lock(key1 int, key2 int)` の namespace（key1）。他用途のロックと
#: 衝突しない固定値にする（backend-plan.md 10章の注意）。
_PIN_PHOTO_UPLOAD_LOCK_NAMESPACE = zlib.crc32(b"sanposcape.pins.pin_photo_uploads") & 0x7FFFFFFF


def _advisory_lock_key(user_id: uuid.UUID) -> int:
    """UUID を `pg_advisory_xact_lock` の signed int4 キーへ畳み込む（決定的・プロセス非依存）。

    Python 組み込みの `hash()` は `PYTHONHASHSEED` によりプロセスごとに変わりうるため
    使わない（同一ユーザーの同時リクエストが別の Lambda 実行環境で処理された場合に
    ロックが効かなくなる）。128bit を32bit ずつ XOR で畳み込むだけなので衝突はあり得るが、
    無関係なユーザー同士がまれに同じロックを共有するだけで、ロックの正しさ
    （同一ユーザーの同時リクエストを直列化する）は損なわれない。
    """
    raw = user_id.int
    key = 0
    for shift in range(0, 128, 32):
        key ^= (raw >> shift) & 0xFFFFFFFF
    if key >= 2**31:
        key -= 2**32
    return key


@dataclass(frozen=True)
class PinReadModel:
    """`PinRead` を組み立てるのに必要な情報一式（1回のロードで揃える）。"""

    pin: Pin
    sanpo_map: SanpoMap
    tags: list[PinTag]
    photos: list[PinPhoto]
    photo_count: int


class PinRepository:
    """pins / pin_photos / pin_tags への DB アクセスを隔離する層。

    member 判定が絡む取得メソッドは `user_id` を必須引数に取り、`sanpo_map_members` との
    JOIN で絞る（ID だけで引ける口を作らない。ADR-003 決定6 と同じ構造的な IDOR 対策）。
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    def get_by_client_pin_id(self, *, user_id: uuid.UUID, client_pin_id: uuid.UUID) -> Pin | None:
        stmt = select(Pin).where(
            Pin.created_by_user_id == user_id, Pin.client_pin_id == client_pin_id
        )
        return self._db.scalars(stmt).first()

    def create(
        self,
        *,
        sanpo_map_id: uuid.UUID,
        created_by_user_id: uuid.UUID,
        client_pin_id: uuid.UUID,
        name: str | None,
        memo: str | None,
        latitude: float,
        longitude: float,
        client_walk_id: uuid.UUID | None,
    ) -> tuple[Pin, bool]:
        """ピンを新規作成する。戻り値は `(pin, created)`。

        `walks/repository.py::create()` と同じ savepoint パターン: `(created_by_user_id,
        client_pin_id)` の UNIQUE 制約違反を `db.begin_nested()` で捕捉し、既存行を
        再取得して返す（`created=False`）。
        """
        pin = Pin(
            sanpo_map_id=sanpo_map_id,
            created_by_user_id=created_by_user_id,
            client_pin_id=client_pin_id,
            name=name,
            memo=memo,
            latitude=latitude,
            longitude=longitude,
            client_walk_id=client_walk_id,
        )
        try:
            with self._db.begin_nested():
                self._db.add(pin)
                self._db.flush()
        except IntegrityError:
            existing = self.get_by_client_pin_id(
                user_id=created_by_user_id, client_pin_id=client_pin_id
            )
            if existing is None:
                raise
            return existing, False
        self._db.refresh(pin)
        return pin, True

    def get_for_member_for_update(
        self, *, user_id: uuid.UUID, pin_id: uuid.UUID
    ) -> tuple[Pin, str] | None:
        """member 判定込みでピンを取得し、`pins` 行を `FOR UPDATE` でロックする。

        写真追加時の position 割り当ての同時実行競合を防ぐ（backend-plan.md 5.3 (5)）。
        """
        stmt = (
            select(Pin, SanpoMapMember.role)
            .join(SanpoMap, SanpoMap.id == Pin.sanpo_map_id)
            .join(SanpoMapMember, SanpoMapMember.sanpo_map_id == SanpoMap.id)
            .where(SanpoMapMember.user_id == user_id, Pin.id == pin_id)
            .with_for_update(of=Pin)
        )
        row = self._db.execute(stmt).first()
        return None if row is None else (row[0], row[1])

    def next_photo_position(self, pin_id: uuid.UUID) -> int:
        stmt = select(func.coalesce(func.max(PinPhoto.position), -1) + 1).where(
            PinPhoto.pin_id == pin_id
        )
        return self._db.scalar(stmt) or 0

    def add_photos(
        self,
        *,
        pin_id: uuid.UUID,
        uploaded_by_user_id: uuid.UUID,
        prepared: list[PreparedPhoto],
        start_position: int,
    ) -> list[PinPhoto]:
        photos = [
            PinPhoto(
                pin_id=pin_id,
                uploaded_by_user_id=uploaded_by_user_id,
                upload_id=item.upload_id,
                s3_key=item.original_key,
                content_type=item.content_type,
                byte_size=item.byte_size,
                width=item.width,
                height=item.height,
                thumbnail_s3_key=item.thumbnail_key,
                thumbnail_byte_size=item.thumbnail_byte_size,
                thumbnail_width=item.thumbnail_width,
                thumbnail_height=item.thumbnail_height,
                position=start_position + offset,
            )
            for offset, item in enumerate(prepared)
        ]
        self._db.add_all(photos)
        # SQLAlchemy 2.0 + psycopg は複数行 INSERT でも `RETURNING`（insertmanyvalues）で
        # サーバー生成値（`created_at`）を `flush()` 時点で populate 済みにする。ループでの
        # `refresh()`（写真枚数ぶんの追加 SELECT）は不要で、確定処理という時間予算がタイトな
        # 経路で無駄な DB ラウンドトリップを増やすだけなので行わない。
        self._db.flush()
        return photos

    def add_tags(
        self, *, pin_id: uuid.UUID, created_by_user_id: uuid.UUID, labels: list[str]
    ) -> list[PinTag]:
        tags = [
            PinTag(
                pin_id=pin_id,
                label=label,
                label_key=tag_key(label),
                created_by_user_id=created_by_user_id,
            )
            for label in labels
        ]
        self._db.add_all(tags)
        # add_photos() と同じ理由でループでの refresh() は行わない（flush() の
        # RETURNING で created_at は既に populate 済み）。
        self._db.flush()
        return tags

    def list_tags(self, pin_id: uuid.UUID) -> list[PinTag]:
        """タグを `created_at, id` 順で返す。

        ★ 同一トランザクション内で複数タグを INSERT した場合（`add_tags()` の通常の
        呼び出され方）、PostgreSQL の `now()` はトランザクション開始時刻で固定されるため
        `created_at` が同値になり、実質的に `id`（ランダムな UUID）順にフォールバックする。
        つまり **`PinCreate.tags` の入力順を保持する保証はない**（順序保持が必要になったら
        `position` 列の追加を検討する）。
        """
        stmt = select(PinTag).where(PinTag.pin_id == pin_id).order_by(PinTag.created_at, PinTag.id)
        return list(self._db.scalars(stmt).all())

    def list_photos(self, pin_id: uuid.UUID, *, limit: int | None = None) -> list[PinPhoto]:
        stmt = select(PinPhoto).where(PinPhoto.pin_id == pin_id).order_by(PinPhoto.position)
        if limit is not None:
            stmt = stmt.limit(limit)
        return list(self._db.scalars(stmt).all())

    def count_photos(self, pin_id: uuid.UUID) -> int:
        stmt = select(func.count()).select_from(PinPhoto).where(PinPhoto.pin_id == pin_id)
        return self._db.scalar(stmt) or 0

    def load_read_model(self, pin_id: uuid.UUID, *, photos_limit: int) -> PinReadModel | None:
        pin = self._db.get(Pin, pin_id)
        if pin is None:
            return None
        sanpo_map = self._db.get(SanpoMap, pin.sanpo_map_id)
        assert sanpo_map is not None  # FK 制約により必ず存在する
        return PinReadModel(
            pin=pin,
            sanpo_map=sanpo_map,
            tags=self.list_tags(pin_id),
            photos=self.list_photos(pin_id, limit=photos_limit),
            photo_count=self.count_photos(pin_id),
        )


class PinPhotoUploadRepository:
    """pin_photo_uploads への DB アクセスを隔離する層。"""

    def __init__(self, db: Session) -> None:
        self._db = db

    def acquire_user_lock(self, *, user_id: uuid.UUID) -> None:
        """ユーザー単位の advisory lock を取る（容量チェックの競合防止, B-D5）。

        トランザクションスコープ（`pg_advisory_xact_lock`）なので、呼び出し元の
        commit/rollback で自動的に解放される。
        """
        self._db.execute(
            select(
                func.pg_advisory_xact_lock(
                    _PIN_PHOTO_UPLOAD_LOCK_NAMESPACE, _advisory_lock_key(user_id)
                )
            )
        )

    def count_active_pending(self, *, user_id: uuid.UUID, now: datetime) -> int:
        stmt = (
            select(func.count())
            .select_from(PinPhotoUpload)
            .where(
                PinPhotoUpload.user_id == user_id,
                PinPhotoUpload.status == "pending",
                PinPhotoUpload.expires_at > now,
            )
        )
        return self._db.scalar(stmt) or 0

    def sum_reserved_bytes(self, *, user_id: uuid.UUID, now: datetime) -> int:
        """未期限の `pending` 枠の申告サイズ合計（容量の先食い分）。"""
        stmt = select(func.coalesce(func.sum(PinPhotoUpload.declared_byte_size), 0)).where(
            PinPhotoUpload.user_id == user_id,
            PinPhotoUpload.status == "pending",
            PinPhotoUpload.expires_at > now,
        )
        return self._db.scalar(stmt) or 0

    def sum_attached_bytes(self, *, user_id: uuid.UUID) -> int:
        """確定済み（`pin_photos`）の実サイズ合計。原本のみ計上（サムネイルは数えない, B-D18）。"""
        stmt = select(func.coalesce(func.sum(PinPhoto.byte_size), 0)).where(
            PinPhoto.uploaded_by_user_id == user_id
        )
        return self._db.scalar(stmt) or 0

    def create(
        self,
        *,
        upload_id: uuid.UUID,
        user_id: uuid.UUID,
        s3_key: str,
        content_type: str,
        declared_byte_size: int,
        expires_at: datetime,
    ) -> PinPhotoUpload:
        upload = PinPhotoUpload(
            id=upload_id,
            user_id=user_id,
            s3_key=s3_key,
            content_type=content_type,
            declared_byte_size=declared_byte_size,
            expires_at=expires_at,
        )
        self._db.add(upload)
        self._db.flush()
        self._db.refresh(upload)
        return upload

    def lock_for_attach(
        self, *, user_id: uuid.UUID, upload_ids: list[uuid.UUID]
    ) -> list[PinPhotoUpload]:
        """他人の `upload_id` は「見つからない」扱い（`user_id` 必須, IDOR 対策）。"""
        stmt = (
            select(PinPhotoUpload)
            .where(PinPhotoUpload.user_id == user_id, PinPhotoUpload.id.in_(upload_ids))
            .with_for_update()
        )
        return list(self._db.scalars(stmt).all())

    def mark_attached(self, *, upload_ids: list[uuid.UUID], attached_at: datetime) -> None:
        self._db.execute(
            update(PinPhotoUpload)
            .where(PinPhotoUpload.id.in_(upload_ids))
            .values(status="attached", attached_at=attached_at)
        )

    def find_attachment(self, *, upload_id: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID] | None:
        """この `upload_id` が既にどこかの写真に紐づいていれば `(pin_id, client_pin_id)`。"""
        stmt = (
            select(PinPhoto.pin_id, Pin.client_pin_id)
            .join(Pin, Pin.id == PinPhoto.pin_id)
            .where(PinPhoto.upload_id == upload_id)
        )
        row = self._db.execute(stmt).first()
        return None if row is None else (row[0], row[1])
