"""pins のユースケース。トランザクション境界（commit）はここが持つ。"""

import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from sanposcape.integrations.aws.s3 import ObjectStorage
from sanposcape.pins.exceptions import (
    PinNotFoundError,
    PinPhotoTooLargeError,
    PinPhotoUploadNotReadyError,
    StorageQuotaExceededError,
    TooManyPendingUploadsError,
)
from sanposcape.pins.mappers import to_pin_photo_list_read, to_pin_read
from sanposcape.pins.models import PinPhotoUpload
from sanposcape.pins.photo_attacher import (
    InvalidPhotoError,
    PhotoAttacher,
    PhotoUploadInput,
    PreparedPhoto,
)
from sanposcape.pins.photo_keys import staging_key
from sanposcape.pins.repository import PinPhotoUploadRepository, PinReadModel, PinRepository
from sanposcape.pins.schemas import (
    PinCreate,
    PinPhotoListRead,
    PinPhotosAdd,
    PinPhotoUploadCreate,
    PinPhotoUploadRead,
    PinRead,
    PresignedUploadRead,
)
from sanposcape.sanpo_maps.exceptions import SanpoMapPermissionDeniedError
from sanposcape.sanpo_maps.permissions import can_add_pin, can_add_pin_photo
from sanposcape.sanpo_maps.service import SanpoMapService
from sanposcape.users.models import User


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

        return PinPhotoUploadRead(
            upload_id=upload.id,
            upload=PresignedUploadRead(url=form.url, fields=form.fields),
            expires_at=now + timedelta(seconds=self._upload_url_ttl_seconds),
            max_byte_size=self._max_byte_size,
        )


class PinService:
    """ピン(Pin)に関するユースケース。トランザクション境界（commit）はここが持つ。"""

    def __init__(
        self,
        db: Session,
        repository: PinRepository,
        upload_repository: PinPhotoUploadRepository,
        sanpo_map_service: SanpoMapService,
        photo_attacher: PhotoAttacher,
        storage: ObjectStorage,
        *,
        user_quota_bytes: int,
        confirm_deadline_seconds: float,
        read_photos_limit: int,
        download_url_ttl_seconds: int,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._db = db
        self._repository = repository
        self._upload_repository = upload_repository
        self._sanpo_map_service = sanpo_map_service
        self._photo_attacher = photo_attacher
        self._storage = storage
        self._user_quota_bytes = user_quota_bytes
        self._confirm_deadline_seconds = confirm_deadline_seconds
        self._read_photos_limit = read_photos_limit
        self._download_url_ttl_seconds = download_url_ttl_seconds
        self._now = now

    def create_pin(
        self, current_user: User, payload: PinCreate, *, base_url: str
    ) -> tuple[PinRead, bool]:
        """ピンを保存する。戻り値は `(pin, created)`。

        処理順序は backend-plan.md 5.5 のとおり: (1) 既存の冪等キーを先に確認して
        以降の処理をスキップ、(2) 地図の解決（無ければ同一トランザクションで作成）、
        (3)〜(4) 写真の検証・サムネイル生成、(5)〜(6) Copy と DB 書き込みをまとめて
        commit、(7) staging の best-effort 削除。
        """
        existing = self._repository.get_by_client_pin_id(
            user_id=current_user.id, client_pin_id=payload.client_pin_id
        )
        if existing is not None:
            read_model = self._require_read_model(existing.id)
            return self._to_pin_read(read_model, current_user, base_url), False

        resolved_map = self._sanpo_map_service.resolve_map_for_new_pin(
            current_user, payload.sanpo_map_id
        )
        if not can_add_pin(resolved_map.role):
            raise SanpoMapPermissionDeniedError()

        prepared_photos: list[PreparedPhoto] = []
        if payload.photo_upload_ids:
            prepared_photos = self._prepare_photos(current_user, payload.photo_upload_ids)

        pin, created = self._repository.create(
            sanpo_map_id=resolved_map.sanpo_map.id,
            created_by_user_id=current_user.id,
            client_pin_id=payload.client_pin_id,
            name=payload.name,
            memo=payload.memo,
            latitude=payload.location.latitude,
            longitude=payload.location.longitude,
            client_walk_id=payload.client_walk_id,
        )
        if not created:
            # 同時に別リクエストが同じ client_pin_id で先着した（真に同時な再送）。
            # 用意した写真（S3 の staging 読み取り・サムネイル生成）は使わずに破棄し、
            # 既存ピンをそのまま返す（DB には何も書き込まない）。
            read_model = self._require_read_model(pin.id)
            return self._to_pin_read(read_model, current_user, base_url), False

        if payload.tags:
            self._repository.add_tags(
                pin_id=pin.id, created_by_user_id=current_user.id, labels=payload.tags
            )

        if prepared_photos:
            self._commit_photos(
                pin_id=pin.id,
                uploaded_by_user_id=current_user.id,
                prepared=prepared_photos,
                start_position=0,
            )

        self._sanpo_map_service.mark_used(resolved_map.sanpo_map.id)
        self._db.commit()

        if prepared_photos:
            self._photo_attacher.cleanup_staging(prepared_photos)

        read_model = self._require_read_model(pin.id)
        return self._to_pin_read(read_model, current_user, base_url), True

    def add_photos(
        self, current_user: User, pin_id: uuid.UUID, payload: PinPhotosAdd, *, base_url: str
    ) -> PinPhotoListRead:
        """ピンに写真を追加する（`POST /pins/{pin_id}/photos`）。"""
        pin_and_role = self._repository.get_for_member_for_update(
            user_id=current_user.id, pin_id=pin_id
        )
        if pin_and_role is None:
            raise PinNotFoundError()
        pin, role = pin_and_role
        if not can_add_pin_photo(role):
            raise SanpoMapPermissionDeniedError()

        existing_photos_by_upload_id = {
            photo.upload_id: photo for photo in self._repository.list_photos(pin.id)
        }
        to_process: list[uuid.UUID] = []
        for upload_id in payload.photo_upload_ids:
            if upload_id in existing_photos_by_upload_id:
                continue  # 既にこのピンに紐付いている（再送は成功扱い）
            attachment = self._upload_repository.find_attachment(upload_id=upload_id)
            if attachment is not None:
                attached_pin_id, _client_pin_id = attachment
                if attached_pin_id != pin.id:
                    raise PinPhotoUploadNotReadyError()  # 別のピンに紐付け済み
                continue
            to_process.append(upload_id)

        prepared_photos: list[PreparedPhoto] = []
        if to_process:
            prepared_photos = self._prepare_photos(current_user, to_process)
            start_position = self._repository.next_photo_position(pin.id)
            self._commit_photos(
                pin_id=pin.id,
                uploaded_by_user_id=current_user.id,
                prepared=prepared_photos,
                start_position=start_position,
            )
            self._sanpo_map_service.mark_used(pin.sanpo_map_id)

        self._db.commit()

        if prepared_photos:
            self._photo_attacher.cleanup_staging(prepared_photos)

        all_photos_by_upload_id = {
            photo.upload_id: photo for photo in self._repository.list_photos(pin.id)
        }
        ordered = [
            all_photos_by_upload_id[upload_id]
            for upload_id in payload.photo_upload_ids
            if upload_id in all_photos_by_upload_id
        ]
        photo_count = self._repository.count_photos(pin.id)
        return to_pin_photo_list_read(
            ordered,
            storage=self._storage,
            base_url=base_url,
            download_url_ttl_seconds=self._download_url_ttl_seconds,
            photo_count=photo_count,
            now=self._now(),
        )

    def _prepare_photos(
        self, current_user: User, upload_ids: list[uuid.UUID]
    ) -> list[PreparedPhoto]:
        now = self._now()
        uploads = self._upload_repository.lock_for_attach(
            user_id=current_user.id, upload_ids=upload_ids
        )
        uploads_by_id: dict[uuid.UUID, PinPhotoUpload] = {upload.id: upload for upload in uploads}
        if len(uploads_by_id) != len(set(upload_ids)):
            raise PinPhotoUploadNotReadyError()  # 存在しない、または他人の枠
        for upload_id in upload_ids:
            upload = uploads_by_id[upload_id]
            if upload.status != "pending" or upload.expires_at <= now:
                raise PinPhotoUploadNotReadyError()

        inputs = [
            PhotoUploadInput(upload_id=upload_id, staging_key=uploads_by_id[upload_id].s3_key)
            for upload_id in upload_ids
        ]
        try:
            prepared = self._photo_attacher.prepare(
                inputs, user_id=current_user.id, deadline_seconds=self._confirm_deadline_seconds
            )
        except InvalidPhotoError as exc:
            raise PinPhotoUploadNotReadyError() from exc

        # 実サイズで容量を再チェック（申告値ではなく実サイズ。自分自身の申告分は
        # reserved_total に含まれているため差し引き、実サイズに置き換えて判定する）。
        total_new_bytes = sum(item.byte_size for item in prepared)
        declared_total = sum(upload.declared_byte_size for upload in uploads_by_id.values())
        attached_total = self._upload_repository.sum_attached_bytes(user_id=current_user.id)
        reserved_total = self._upload_repository.sum_reserved_bytes(
            user_id=current_user.id, now=now
        )
        projected_usage = attached_total + (reserved_total - declared_total) + total_new_bytes
        if projected_usage > self._user_quota_bytes:
            raise StorageQuotaExceededError()

        return prepared

    def _commit_photos(
        self,
        *,
        pin_id: uuid.UUID,
        uploaded_by_user_id: uuid.UUID,
        prepared: list[PreparedPhoto],
        start_position: int,
    ) -> None:
        self._photo_attacher.commit(prepared)
        self._repository.add_photos(
            pin_id=pin_id,
            uploaded_by_user_id=uploaded_by_user_id,
            prepared=prepared,
            start_position=start_position,
        )
        self._upload_repository.mark_attached(
            upload_ids=[item.upload_id for item in prepared], attached_at=self._now()
        )

    def _require_read_model(self, pin_id: uuid.UUID) -> PinReadModel:
        read_model = self._repository.load_read_model(pin_id, photos_limit=self._read_photos_limit)
        assert read_model is not None  # 直前に存在を確認済みの pin_id なので必ず取れる
        return read_model

    def _to_pin_read(self, read_model: PinReadModel, current_user: User, base_url: str) -> PinRead:
        return to_pin_read(
            read_model.pin,
            sanpo_map=read_model.sanpo_map,
            tags=read_model.tags,
            photos=read_model.photos,
            photo_count=read_model.photo_count,
            current_user_id=current_user.id,
            storage=self._storage,
            base_url=base_url,
            download_url_ttl_seconds=self._download_url_ttl_seconds,
            photos_limit=self._read_photos_limit,
            now=self._now(),
        )
