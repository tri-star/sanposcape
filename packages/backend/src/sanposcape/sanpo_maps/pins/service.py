"""pins のユースケース。トランザクション境界（commit）はここが持つ。"""

import logging
import uuid
from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from sanposcape.core.pagination import (
    decode_cursor,
    decode_position_cursor,
    encode_cursor,
    encode_position_cursor,
)
from sanposcape.integrations.aws.s3 import ObjectStorage
from sanposcape.sanpo_maps.exceptions import (
    PinNotFoundError,
    PinPhotoNotFoundError,
    PinPhotoUploadNotReadyError,
    PinTagLimitExceededError,
    SanpoMapNotFoundError,
    SanpoMapPermissionDeniedError,
    StorageQuotaExceededError,
)
from sanposcape.sanpo_maps.maps.access import SanpoMapAccess
from sanposcape.sanpo_maps.models import PinPhotoUpload, PinTag
from sanposcape.sanpo_maps.permissions import (
    can_add_pin,
    can_add_pin_photo,
    can_add_pin_tag,
    can_delete_pin,
    can_delete_pin_photo,
    can_delete_pin_tag,
    can_update_pin,
    can_update_pin_archived,
    can_update_pin_visited,
)
from sanposcape.sanpo_maps.photos.cleanup import PhotoObjectCleaner, flatten_photo_keys
from sanposcape.sanpo_maps.photos.photo_attacher import (
    InvalidPhotoError,
    PhotoAttacher,
    PhotoUploadInput,
    PreparedPhoto,
)
from sanposcape.sanpo_maps.photos.repository import PinPhotoUploadRepository
from sanposcape.sanpo_maps.pins.mappers import (
    to_pin_list_item_read,
    to_pin_photo_list_read,
    to_pin_photo_page_read,
    to_pin_read,
)
from sanposcape.sanpo_maps.pins.repository import (
    NOT_PROVIDED,
    PinBoundingBox,
    PinReadModel,
    PinRepository,
)
from sanposcape.sanpo_maps.pins.schemas import (
    PIN_TAGS_MAX_COUNT,
    PinCreate,
    PinListQuery,
    PinListRead,
    PinPhotoListRead,
    PinPhotoPageRead,
    PinPhotosAdd,
    PinRead,
    PinUpdate,
)
from sanposcape.sanpo_maps.pins.tag_labels import tag_key
from sanposcape.users.models import User

logger = logging.getLogger(__name__)


class PinService:
    """ピン(Pin)に関するユースケース。トランザクション境界（commit）はここが持つ。"""

    def __init__(
        self,
        db: Session,
        repository: PinRepository,
        upload_repository: PinPhotoUploadRepository,
        sanpo_map_access: SanpoMapAccess,
        photo_attacher: PhotoAttacher,
        photo_cleaner: PhotoObjectCleaner,
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
        self._sanpo_map_access = sanpo_map_access
        self._photo_attacher = photo_attacher
        self._photo_cleaner = photo_cleaner
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

        resolved_map = self._sanpo_map_access.resolve_map_for_new_pin(
            current_user, payload.sanpo_map_id
        )
        if not can_add_pin(resolved_map.role):
            raise SanpoMapPermissionDeniedError()

        prepared_photos: list[PreparedPhoto] = []
        confirm_deadline_at: float | None = None
        if payload.photo_upload_ids:
            try:
                prepared_photos, confirm_deadline_at = self._prepare_photos(
                    current_user, payload.photo_upload_ids
                )
            except PinPhotoUploadNotReadyError:
                # 真に同時な冪等リトライの可能性: このロック待ちの間に、同じ client_pin_id で
                # 先着したリクエストが確定処理を終えて commit したかもしれない（ADR-003 決定3・
                # backend-plan.md 5.5 手順3）。`lock_for_attach` の行ロック解放後に読むこの
                # SELECT は、先着リクエストが commit していれば必ずそれを拾える。
                existing = self._repository.get_by_client_pin_id(
                    user_id=current_user.id, client_pin_id=payload.client_pin_id
                )
                if existing is None:
                    raise
                read_model = self._require_read_model(existing.id)
                return self._to_pin_read(read_model, current_user, base_url), False

        pin, created = self._repository.create(
            sanpo_map_id=resolved_map.sanpo_map.id,
            created_by_user_id=current_user.id,
            client_pin_id=payload.client_pin_id,
            name=payload.name,
            memo=payload.memo,
            latitude=payload.location.latitude,
            longitude=payload.location.longitude,
            client_walk_id=payload.client_walk_id,
            visited=payload.visited,
        )
        if not created:
            # 同時に別リクエストが同じ client_pin_id で先着した（真に同時な再送）。
            # 用意した写真（S3 の staging 読み取り・サムネイル生成）は使わずに破棄し、
            # 既存ピンをそのまま返す（DB には何も書き込まない）。
            read_model = self._require_read_model(pin.id)
            return self._to_pin_read(read_model, current_user, base_url), False

        # commit 前に控える（R2: commit 後は expire_on_commit により pin.id への
        # アクセスが不要な SELECT を招きうるため、`PinPhotoUploadService.delete_upload`
        # と同じく ORM 属性は commit 前に読み切っておく）。
        pin_id = pin.id

        if payload.tags:
            self._repository.add_tags(
                pin_id=pin_id, created_by_user_id=current_user.id, labels=payload.tags
            )

        if prepared_photos:
            if confirm_deadline_at is None:
                raise AssertionError(
                    "prepared_photos is non-empty but confirm_deadline_at is unset"
                )
            self._commit_photos(
                pin_id=pin_id,
                uploaded_by_user_id=current_user.id,
                prepared=prepared_photos,
                start_position=0,
                deadline_at=confirm_deadline_at,
            )

        self._sanpo_map_access.mark_used(resolved_map.sanpo_map.id)
        self._db.commit()

        if prepared_photos:
            if confirm_deadline_at is None:
                raise AssertionError(
                    "prepared_photos is non-empty but confirm_deadline_at is unset"
                )
            self._photo_attacher.cleanup_staging(prepared_photos, deadline_at=confirm_deadline_at)

        read_model = self._require_read_model(pin_id)
        return self._to_pin_read(read_model, current_user, base_url), True

    def list_pins(self, current_user: User, query: PinListQuery, *, base_url: str) -> PinListRead:
        """`GET /pins` の一覧を返す（SS-111）。member でない地図は 404（存在を漏らさない）。

        閲覧系のため commit しない（`SanpoMapService.list_maps` と同じ）。
        """
        role = self._sanpo_map_access.get_role(current_user, query.sanpo_map_id)
        if role is None:
            raise SanpoMapNotFoundError()

        cursor = decode_cursor(query.cursor) if query.cursor is not None else None
        bbox: PinBoundingBox | None = None
        if query.min_latitude is not None:
            if (
                query.max_latitude is None
                or query.min_longitude is None
                or query.max_longitude is None
            ):
                # PinListQuery.model_validator が保証しているはずの不変条件違反。
                raise AssertionError("PinListQuery bounding box fields are inconsistent")
            bbox = PinBoundingBox(
                min_latitude=query.min_latitude,
                min_longitude=query.min_longitude,
                max_latitude=query.max_latitude,
                max_longitude=query.max_longitude,
            )

        rows = self._repository.list_for_member(
            user_id=current_user.id,
            sanpo_map_id=query.sanpo_map_id,
            bbox=bbox,
            q=query.q,
            tag_keys=query.tags,
            limit=query.limit,
            cursor=cursor,
            archived=query.archived,
            visited=query.visited,
        )

        has_more = len(rows) > query.limit
        page = rows[: query.limit]
        next_cursor = encode_cursor(page[-1].created_at, page[-1].id) if has_more and page else None

        pin_ids = [pin.id for pin in page]
        tags_by_pin_id = self._repository.list_tags_for_pins(pin_ids)
        cover_photos_by_pin_id = self._repository.get_cover_photos(pin_ids)
        photo_counts_by_pin_id = self._repository.count_photos_for_pins(pin_ids)

        # 全要素の urls_expire_at をそろえるため、now() は1回だけ取る。
        now = self._now()
        items = [
            to_pin_list_item_read(
                pin,
                tags=tags_by_pin_id.get(pin.id, []),
                cover_photo=cover_photos_by_pin_id.get(pin.id),
                photo_count=photo_counts_by_pin_id.get(pin.id, 0),
                storage=self._storage,
                base_url=base_url,
                download_url_ttl_seconds=self._download_url_ttl_seconds,
                now=now,
            )
            for pin in page
        ]
        return PinListRead(items=items, next_cursor=next_cursor)

    def get_pin(self, current_user: User, pin_id: uuid.UUID, *, base_url: str) -> PinRead:
        """`GET /pins/{pin_id}` の詳細を返す（SS-111）。member でないピンは 404。"""
        member = self._repository.get_for_member(user_id=current_user.id, pin_id=pin_id)
        if member is None:
            raise PinNotFoundError()
        read_model = self._require_read_model(pin_id)
        return self._to_pin_read(read_model, current_user, base_url)

    def list_pin_photos(
        self,
        current_user: User,
        pin_id: uuid.UUID,
        *,
        limit: int,
        cursor: str | None,
        base_url: str,
    ) -> PinPhotoPageRead:
        """`GET /pins/{pin_id}/photos` の全件ページングを返す（ADR-009 決定17）。

        `pin_id` の認可は `get_for_member()` で確認してから `list_photos_page()` を
        呼ぶ（repository の docstring が要求する前提）。
        """
        member = self._repository.get_for_member(user_id=current_user.id, pin_id=pin_id)
        if member is None:
            raise PinNotFoundError()

        decoded_cursor = decode_position_cursor(cursor) if cursor is not None else None
        photos = self._repository.list_photos_page(
            pin_id=pin_id, limit=limit, cursor=decoded_cursor
        )

        has_more = len(photos) > limit
        page = photos[:limit]
        next_cursor = (
            encode_position_cursor(page[-1].position, page[-1].id) if has_more and page else None
        )
        photo_count = self._repository.count_photos(pin_id)
        return to_pin_photo_page_read(
            page,
            storage=self._storage,
            base_url=base_url,
            download_url_ttl_seconds=self._download_url_ttl_seconds,
            photo_count=photo_count,
            next_cursor=next_cursor,
            now=self._now(),
        )

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
        remaining_ids = [
            upload_id
            for upload_id in payload.photo_upload_ids
            if upload_id not in existing_photos_by_upload_id
        ]
        attachments = self._upload_repository.find_attachments(
            user_id=current_user.id, upload_ids=remaining_ids
        )
        to_process: list[uuid.UUID] = []
        for upload_id in remaining_ids:
            attachment = attachments.get(upload_id)
            if attachment is not None:
                attached_pin_id, _client_pin_id = attachment
                if attached_pin_id != pin.id:
                    raise PinPhotoUploadNotReadyError()  # 別のピンに紐付け済み
                continue  # 既にこのピンに紐付いている（再送は成功扱い）
            to_process.append(upload_id)

        prepared_photos: list[PreparedPhoto] = []
        confirm_deadline_at: float | None = None
        if to_process:
            try:
                prepared_photos, confirm_deadline_at = self._prepare_photos(
                    current_user, to_process
                )
            except PinPhotoUploadNotReadyError:
                # 真に同時な冪等リトライの可能性: ロック待ちの間に別リクエストが同じ枠を
                # 「このピン」へ紐付け済みにしたかもしれない（R1 と同じ根本原因）。再確認して
                # 全て対象ピンに紐付いていれば成功扱いに倒す。
                recheck = self._upload_repository.find_attachments(
                    user_id=current_user.id, upload_ids=to_process
                )
                still_unattached = [
                    upload_id
                    for upload_id in to_process
                    if recheck.get(upload_id, (None, None))[0] != pin.id
                ]
                if still_unattached:
                    raise
                to_process = []

            if to_process:
                if confirm_deadline_at is None:
                    raise AssertionError("to_process is non-empty but confirm_deadline_at is unset")
                start_position = self._repository.next_photo_position(pin.id)
                self._commit_photos(
                    pin_id=pin.id,
                    uploaded_by_user_id=current_user.id,
                    prepared=prepared_photos,
                    start_position=start_position,
                    deadline_at=confirm_deadline_at,
                )
                self._sanpo_map_access.mark_used(pin.sanpo_map_id)

        self._db.commit()

        if prepared_photos:
            if confirm_deadline_at is None:
                raise AssertionError(
                    "prepared_photos is non-empty but confirm_deadline_at is unset"
                )
            self._photo_attacher.cleanup_staging(prepared_photos, deadline_at=confirm_deadline_at)

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

    def update_pin(
        self, current_user: User, pin_id: uuid.UUID, payload: PinUpdate, *, base_url: str
    ) -> PinRead:
        """`PATCH /pins/{pin_id}`: 名前・メモ・訪問状況・アーカイブ状態の更新とタグの
        追加・削除を1リクエストで原子的に行う（ADR-009 決定19・20・32）。

        権限は「送られたフィールド」ごとに判定し（値が今と同じでも判定する）、1つでも
        権限が無ければ何も反映せず 403 にする（決定20）。判定の順序は決定21のとおり:
        member（404）→ 権限（403）→ タグ件数（409）。`updated_at` は実際に変化があった
        場合（`visited`/`archived` が実際に変わった場合を含む）だけ進める（決定23・32）。
        """
        result = self._repository.get_for_member_for_update(user_id=current_user.id, pin_id=pin_id)
        if result is None:
            raise PinNotFoundError()
        pin, role = result

        fields_set = payload.model_fields_set
        wants_name_update = "name" in fields_set
        wants_memo_update = "memo" in fields_set
        wants_visited_update = "visited" in fields_set
        wants_archived_update = "archived" in fields_set
        wants_tag_add = bool(payload.add_tags)
        wants_tag_remove = bool(payload.remove_tag_ids)

        # --- 権限チェック（この時点ではまだ何も変更しない。1つでも NG なら全体を 403） ---
        is_creator = pin.created_by_user_id == current_user.id
        if (wants_name_update or wants_memo_update) and not can_update_pin(
            role, is_creator=is_creator
        ):
            raise SanpoMapPermissionDeniedError()
        if wants_visited_update and not can_update_pin_visited(role):
            raise SanpoMapPermissionDeniedError()
        if wants_archived_update and not can_update_pin_archived(role, is_creator=is_creator):
            raise SanpoMapPermissionDeniedError()

        tags_to_remove: list[PinTag] = []
        if wants_tag_remove:
            # `pin_id` で絞るため、このピンに無い ID は黙って無視される（決定21）。
            tags_to_remove = self._repository.get_tags_by_ids(
                pin_id=pin.id, tag_ids=payload.remove_tag_ids
            )
            for tag in tags_to_remove:
                if not can_delete_pin_tag(
                    role, is_creator=tag.created_by_user_id == current_user.id
                ):
                    raise SanpoMapPermissionDeniedError()

        if wants_tag_add and not can_add_pin_tag(role):
            raise SanpoMapPermissionDeniedError()

        # --- 適用: 削除 → 追加 → 件数チェック（決定20） ---
        name_changed = wants_name_update and payload.name != pin.name
        memo_changed = wants_memo_update and payload.memo != pin.memo
        # `PinUpdate` が明示的な null を弾いているので、送られた値は bool（静的には
        # `bool | None` のままなので、None でないことを条件に含めて絞り込む）。
        new_visited = payload.visited if wants_visited_update else None
        new_archived = payload.archived if wants_archived_update else None
        visited_changed = new_visited is not None and new_visited != pin.visited
        archived_changed = new_archived is not None and new_archived != pin.archived

        if tags_to_remove:
            self._repository.delete_tags(tags_to_remove)

        added_tags: list[PinTag] = []
        if wants_tag_add:
            # 削除の後の最新状態で重複判定する（削除・追加に同じラベルを含めた場合は
            # 付け替わる。既存の label_key はスキップして冪等にする）。
            existing_keys = {tag.label_key for tag in self._repository.list_tags(pin.id)}
            labels_to_add = [
                label for label in payload.add_tags if tag_key(label) not in existing_keys
            ]
            if labels_to_add:
                added_tags = self._repository.add_tags(
                    pin_id=pin.id, created_by_user_id=current_user.id, labels=labels_to_add
                )

        if (wants_tag_add or tags_to_remove) and self._repository.count_tags(
            pin.id
        ) > PIN_TAGS_MAX_COUNT:
            raise PinTagLimitExceededError()

        tags_changed = bool(added_tags) or bool(tags_to_remove)
        if name_changed or memo_changed or visited_changed or archived_changed or tags_changed:
            self._repository.update_fields(
                pin,
                name=payload.name if wants_name_update else NOT_PROVIDED,
                memo=payload.memo if wants_memo_update else NOT_PROVIDED,
                visited=new_visited if visited_changed else NOT_PROVIDED,
                archived=new_archived if archived_changed else NOT_PROVIDED,
                updated_at=self._now(),
            )

        self._db.commit()

        # `pin_id` は引数（commit の影響を受けない）をそのまま使う（R2）。
        read_model = self._require_read_model(pin_id)
        return self._to_pin_read(read_model, current_user, base_url)

    def delete_pin(self, current_user: User, pin_id: uuid.UUID) -> None:
        """`DELETE /pins/{pin_id}`: ピンを削除する（ADR-009 決定19）。

        editor が自分のピンを削除すると、他のメンバーが付けた写真・タグも DB の
        CASCADE で消える（ピン単位の削除である以上避けられない, 決定19）。DB の commit を
        先に確定し、S3 の実体は best-effort で削除する（決定22。ストレージ障害・未構成でも
        204 のまま）。
        """
        result = self._repository.get_for_member_for_update(user_id=current_user.id, pin_id=pin_id)
        if result is None:
            raise PinNotFoundError()
        pin, role = result
        if not can_delete_pin(role, is_creator=pin.created_by_user_id == current_user.id):
            raise SanpoMapPermissionDeniedError()

        photo_key_pairs = self._repository.list_photo_keys(pin.id)
        keys = flatten_photo_keys(photo_key_pairs)
        # commit 前に控える（R2: `PinPhotoUploadService.delete_upload` と同じ流儀で、
        # commit 後は `pin_id` 引数・ここで控えた `user_id` だけを使い、ORM 属性には
        # 触れない）。
        user_id = current_user.id

        self._repository.delete_pin(pin)
        self._db.commit()

        logger.info(
            "Pin deleted: pin_id=%s by user_id=%s photos=%d",
            pin_id,
            user_id,
            len(photo_key_pairs),
        )
        self._photo_cleaner.delete_best_effort(keys)

    def delete_photo(self, current_user: User, pin_id: uuid.UUID, photo_id: uuid.UUID) -> None:
        """`DELETE /pins/{pin_id}/photos/{photo_id}`: 写真1枚を削除する（ADR-009 決定19）。

        持ち主はアップロード者（`uploaded_by_user_id`）。地図 owner は他人の写真も削除
        できるが、ピン作成者の editor でも他人の写真は削除できない（決定19）。
        """
        result = self._repository.get_for_member_for_update(user_id=current_user.id, pin_id=pin_id)
        if result is None:
            raise PinNotFoundError()
        pin, role = result

        photo = self._repository.get_photo_for_pin(pin_id=pin.id, photo_id=photo_id)
        if photo is None:
            raise PinPhotoNotFoundError()

        if not can_delete_pin_photo(role, is_uploader=photo.uploaded_by_user_id == current_user.id):
            raise SanpoMapPermissionDeniedError()

        keys = [key for key in (photo.s3_key, photo.thumbnail_s3_key) if key is not None]
        # commit 前に控える（R2: 同上）。
        user_id = current_user.id

        self._repository.delete_photo(photo)
        self._db.commit()

        logger.info(
            "Pin photo deleted: pin_id=%s photo_id=%s by user_id=%s",
            pin_id,
            photo_id,
            user_id,
        )
        self._photo_cleaner.delete_best_effort(keys)

    def _prepare_photos(
        self, current_user: User, upload_ids: list[uuid.UUID]
    ) -> tuple[list[PreparedPhoto], float]:
        """検証・サムネイル生成まで終える。戻り値は `(prepared, confirm_deadline_at)`。

        `confirm_deadline_at` は `prepare()` と `commit()` で共有する単一の締め切り
        （`time.monotonic()` 基準）。呼び出し元はこれをそのまま `_commit_photos()` に渡す
        （確定処理全体で `PIN_PHOTO_CONFIRM_DEADLINE_SECONDS` 以内に収める設計, R2）。
        """
        now = self._now()
        # ユーザー単位の advisory lock を、行ロック（`lock_for_attach`）より先に取る
        # （`PinPhotoUploadService.create_upload` と同じ取得順序にして、advisory lock と
        # 行ロックの取得順序が経路によって逆転しないようにする。順序が経路ごとに違うと
        # デッドロックしうる）。確定時の実サイズ容量再チェックをこのロックで保護することで、
        # 同時確定による合計クォータの先食い競合を防ぐ（R4）。
        self._upload_repository.acquire_user_lock(user_id=current_user.id)
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

        confirm_deadline_at = self._photo_attacher.compute_deadline(self._confirm_deadline_seconds)
        inputs = [
            PhotoUploadInput(upload_id=upload_id, staging_key=uploads_by_id[upload_id].s3_key)
            for upload_id in upload_ids
        ]
        try:
            prepared = self._photo_attacher.prepare(
                inputs, user_id=current_user.id, deadline_at=confirm_deadline_at
            )
        except InvalidPhotoError as exc:
            raise PinPhotoUploadNotReadyError() from exc

        # 実サイズで容量を再チェック（申告値ではなく実サイズ。自分自身の申告分は
        # reserved_total に含まれているため差し引き、実サイズに置き換えて判定する）。
        # 上で取得した advisory lock により、同時に確定している他リクエストの
        # 未コミット分と競合しても合計を二重に見逃さない（R4）。
        total_new_bytes = sum(item.byte_size for item in prepared)
        declared_total = sum(upload.declared_byte_size for upload in uploads_by_id.values())
        attached_total = self._upload_repository.sum_attached_bytes(user_id=current_user.id)
        reserved_total = self._upload_repository.sum_reserved_bytes(
            user_id=current_user.id, now=now
        )
        projected_usage = attached_total + (reserved_total - declared_total) + total_new_bytes
        if projected_usage > self._user_quota_bytes:
            raise StorageQuotaExceededError()

        return prepared, confirm_deadline_at

    def _commit_photos(
        self,
        *,
        pin_id: uuid.UUID,
        uploaded_by_user_id: uuid.UUID,
        prepared: list[PreparedPhoto],
        start_position: int,
        deadline_at: float,
    ) -> None:
        self._photo_attacher.commit(prepared, deadline_at=deadline_at)
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
        if read_model is None:
            # 直前に存在を確認済みの pin_id のはずの不変条件違反。`assert` は `-O` 実行時に
            # 除去されるため使わない（repository.py の load_read_model と同じ流儀）。
            raise AssertionError(f"Pin {pin_id} disappeared between existence check and read")
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
