"""写真アップロード枠のユースケース。トランザクション境界（commit）はここが持つ。"""

import logging
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from sanposcape.integrations.aws.s3 import ObjectStorage, ObjectStorageUnavailableError
from sanposcape.sanpo_maps.exceptions import (
    PinPhotoTooLargeError,
    PinPhotoUploadAlreadyAttachedError,
    PinPhotoUploadNotFoundError,
    StorageQuotaExceededError,
    TooManyPendingUploadsError,
)
from sanposcape.sanpo_maps.photos.photo_keys import staging_key
from sanposcape.sanpo_maps.photos.repository import PinPhotoUploadRepository
from sanposcape.sanpo_maps.photos.schemas import (
    PinPhotoUploadCreate,
    PinPhotoUploadRead,
    PresignedUploadRead,
)
from sanposcape.users.models import User

logger = logging.getLogger(__name__)


class PinPhotoUploadService:
    """写真アップロード枠の発行（`POST /pin-photo-uploads`）。"""

    def __init__(
        self,
        db: Session,
        repository: PinPhotoUploadRepository,
        storage: ObjectStorage,
        *,
        max_byte_size: int,
        user_quota_bytes: int,
        max_pending_uploads: int,
        upload_url_ttl_seconds: int,
        attach_ttl_seconds: int,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._db = db
        self._repository = repository
        self._storage = storage
        self._max_byte_size = max_byte_size
        self._user_quota_bytes = user_quota_bytes
        self._max_pending_uploads = max_pending_uploads
        self._upload_url_ttl_seconds = upload_url_ttl_seconds
        self._attach_ttl_seconds = attach_ttl_seconds
        self._now = now

    def create_upload(
        self, current_user: User, payload: PinPhotoUploadCreate, *, base_url: str
    ) -> PinPhotoUploadRead:
        if payload.byte_size > self._max_byte_size:
            raise PinPhotoTooLargeError()

        now = self._now()
        # ユーザー単位の advisory lock で容量チェックの競合を防ぐ（B-D5）。
        self._repository.acquire_user_lock(user_id=current_user.id)

        pending_count = self._repository.count_active_pending(user_id=current_user.id, now=now)
        if pending_count >= self._max_pending_uploads:
            raise TooManyPendingUploadsError()

        used = self._repository.sum_attached_bytes(
            user_id=current_user.id
        ) + self._repository.sum_reserved_bytes(user_id=current_user.id, now=now)
        if used + payload.byte_size > self._user_quota_bytes:
            raise StorageQuotaExceededError()

        upload_id = uuid.uuid4()
        key = staging_key(user_id=current_user.id, upload_id=upload_id)
        attach_expires_at = now + timedelta(seconds=self._attach_ttl_seconds)

        upload = self._repository.create(
            upload_id=upload_id,
            user_id=current_user.id,
            s3_key=key,
            content_type=payload.content_type,
            declared_byte_size=payload.byte_size,
            expires_at=attach_expires_at,
            taken_at=payload.taken_at,
        )
        # ストレージ障害時はここで例外が伝播し、上の flush 済み行は commit されないまま
        # セッション終了時に暗黙ロールバックされる（router からは 503 として見える）。
        form = self._storage.create_upload_form(
            key=key,
            content_type=payload.content_type,
            max_bytes=self._max_byte_size,
            expires_in=self._upload_url_ttl_seconds,
            base_url=base_url,
        )
        self._db.commit()

        # 直送（端末 → S3）は backend を通らないため、発行した枠とキーを残しておかないと
        # 「どのオブジェクトが届くはずだったのか」を後から S3 と突き合わせられない
        # （SS-88 の実機調査での反省。`core/observability.py` の冒頭も参照）。
        # ★ `form.fields` は絶対にログへ出さないこと（policy / 署名 / 一時認証情報を含む）。
        # `taken_at` も出さない（行動の履歴に当たり、障害調査に要らない, 決定34）。
        logger.info(
            "pin photo upload issued: upload_id=%s key=%s content_type=%s "
            "declared_bytes=%d max_bytes=%d storage=%s",
            upload_id,
            key,
            payload.content_type,
            payload.byte_size,
            self._max_byte_size,
            type(self._storage).__name__,
        )

        return PinPhotoUploadRead(
            upload_id=upload.id,
            upload=PresignedUploadRead(url=form.url, fields=form.fields),
            expires_at=now + timedelta(seconds=self._upload_url_ttl_seconds),
            max_byte_size=self._max_byte_size,
        )

    def delete_upload(self, current_user: User, upload_id: uuid.UUID) -> None:
        """未使用（`pending`）のアップロード枠を取り消す（`DELETE /pin-photo-uploads/{id}`,
        PR #93 T11）。

        mobile が「先行アップロード済みだが、まだピンに紐付けていない写真」を削除した際に
        呼ぶ想定（`usePinPhotos.ts` の `removePhoto`）。呼ばなければ枠は紐付け期限
        （既定6時間）まで pending のまま残り、容量予約・未使用枠カウントを占有し続ける。

        本人の枠のみが対象（他人・存在しない `upload_id` は `PinPhotoUploadNotFoundError`
        → 404, IDOR 対策）。既に写真として紐付け済みなら `PinPhotoUploadAlreadyAttachedError`
        → 409（取り消しは未紐付けの枠専用）。DB 行の削除を先に commit してから、S3/フェイク
        ストレージ側の実体を best-effort で削除する（staging は S3 のライフサイクルで
        最終的に消えるため、ここでの削除に失敗しても実害はない）。
        """
        upload = self._repository.find_own_for_update(user_id=current_user.id, upload_id=upload_id)
        if upload is None:
            raise PinPhotoUploadNotFoundError()
        if upload.status != "pending":
            raise PinPhotoUploadAlreadyAttachedError()

        s3_key = upload.s3_key
        self._repository.delete(upload)
        self._db.commit()

        try:
            self._storage.delete(s3_key)
        except ObjectStorageUnavailableError:
            logger.warning("Failed to delete staging object for a cancelled upload: %s", s3_key)
