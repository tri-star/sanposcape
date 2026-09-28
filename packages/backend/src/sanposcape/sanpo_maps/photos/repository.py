import uuid
import zlib
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from sanposcape.sanpo_maps.models import Pin, PinPhoto, PinPhotoUpload

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

    def find_own_for_update(
        self, *, user_id: uuid.UUID, upload_id: uuid.UUID
    ) -> PinPhotoUpload | None:
        """本人の枠を1件、行ロック付きで取得する（`DELETE /pin-photo-uploads/{upload_id}`,
        PR #93 T11）。他人の `upload_id` は「見つからない」扱い（IDOR 対策、
        `lock_for_attach()` と同じ設計）。

        `with_for_update()` にする理由: 同時に別リクエストがこの枠を `lock_for_attach()`
        で確定処理中（＝行ロック保持中）の場合、ここでの取得をその確定処理の commit/
        rollback まで待たせる。ロックせずに読むと「pending」の古い状態を読んだまま
        削除してしまい、直後に相手が `attached` へ更新してコミットする、という
        取り消し不能な競合（本来 409 になるべき削除が成功してしまう）が起こりうる。
        """
        stmt = (
            select(PinPhotoUpload)
            .where(PinPhotoUpload.user_id == user_id, PinPhotoUpload.id == upload_id)
            .with_for_update()
        )
        return self._db.scalars(stmt).first()

    def delete(self, upload: PinPhotoUpload) -> None:
        """行を削除する（`status` に「取り消し済み」を追加せず物理削除する。PR #93 T11:
        容量予約（`sum_reserved_bytes`）・未使用枠カウント（`count_active_pending`）は
        どちらも `status="pending"` の行を数えるため、削除すれば即座に対象から外れる）。
        """
        self._db.delete(upload)
        self._db.flush()

    def find_attachments(
        self, *, user_id: uuid.UUID, upload_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, tuple[uuid.UUID, uuid.UUID]]:
        """指定した `upload_id` 群のうち、既にどこかの写真に紐づいているものを
        `{upload_id: (pin_id, client_pin_id)}` で返す。

        `uploaded_by_user_id == user_id` で絞る（アップロード者本人以外の枠の紐付け状況を
        横断的に解決できないようにする, IDOR 対策。他のリポジトリメソッドと同じ
        「`user_id` を必須引数にし ID だけで引ける口を作らない」規約に合わせる）。
        1クエリでまとめて解決するため、複数件を呼び出し元でループしても N+1 にならない。
        """
        if not upload_ids:
            return {}
        stmt = (
            select(PinPhoto.upload_id, PinPhoto.pin_id, Pin.client_pin_id)
            .join(Pin, Pin.id == PinPhoto.pin_id)
            .where(PinPhoto.upload_id.in_(upload_ids), PinPhoto.uploaded_by_user_id == user_id)
        )
        return {row[0]: (row[1], row[2]) for row in self._db.execute(stmt)}
