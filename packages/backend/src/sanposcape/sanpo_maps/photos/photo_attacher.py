"""写真の確定処理（検証・メタデータ除去・サムネイル生成・原本の Put）。

`POST /pins` と `POST /pins/{pin_id}/photos` で共通（backend-plan.md 5.5）。DB や FastAPI
に依存しない（S3 / Pillow の呼び出しのみ）。時間予算・並列度は呼び出し元（`pins/service.py`）
が `Settings` から注入する。
"""

import logging
import time
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime

from sanposcape.integrations.aws.s3 import (
    ObjectNotFoundError,
    ObjectStorage,
    ObjectStorageUnavailableError,
    ObjectTooLargeError,
)
from sanposcape.sanpo_maps.photos.jpeg_metadata import strip_jpeg_metadata
from sanposcape.sanpo_maps.photos.photo_keys import original_key, thumbnail_key
from sanposcape.sanpo_maps.photos.thumbnails import InvalidImageError, make_thumbnail

logger = logging.getLogger(__name__)


class InvalidPhotoError(Exception):
    """アップロード枠の実体が不正（デコード不可・サイズ超過・画素数超過など）。呼び出し元は
    `PinPhotoUploadNotReadyError`（409）に変換する。
    """


@dataclass(frozen=True)
class PhotoUploadInput:
    """`pin_photo_uploads` から読んだ、確定処理に必要な最小限の情報。"""

    upload_id: uuid.UUID
    staging_key: str
    # 確定処理では使わず、`PreparedPhoto` へそのまま渡す（枠 → `pin_photos` の運搬用, 決定34）。
    taken_at: datetime | None = None


@dataclass(frozen=True)
class PreparedPhoto:
    """検証・サムネイル生成まで終えた1枚分の結果（DB 書き込み・S3 への Put の直前の状態）。"""

    upload_id: uuid.UUID
    staging_key: str
    original_key: str
    thumbnail_key: str
    content_type: str
    byte_size: int
    width: int
    height: int
    thumbnail_bytes: bytes
    thumbnail_byte_size: int
    thumbnail_width: int
    thumbnail_height: int
    # 既定値を置かない: 組み立て元（`prepare()`）での渡し忘れを型で防ぐ。
    taken_at: datetime | None
    # 原本として保存するバイト列（メタデータを除去・検証済み。ADR-009 決定35, SS-116）。
    # `commit()` は staging を Copy せず、常にこれを Put する。staging は検証の後でも
    # 同じ枠の presigned POST で上書きされうるため、Copy すると未検証のバイト列が原本に入る。
    original_bytes: bytes


class PhotoAttacher:
    """写真1〜10枚の確定処理を並列に行う。

    時間予算のガード: `prepare()` / `commit()` はともにタスク開始前に残り時間を確認し、
    超過していれば新規タスクを開始せず `ObjectStorageUnavailableError` にする（503。
    冪等なのでクライアントは再送してよい）。**既に実行中のタスクを強制中断するものではない**
    （Python のスレッドは協調的にしか止められないため）。個々の S3 呼び出しは
    `Settings.object_storage_*_timeout_seconds` で有界なので、全体の遅延はそれらの
    積で抑えられる。

    呼び出し元（`PinService`）は `compute_deadline()` で確定処理全体（`prepare()`・
    `commit()`・`cleanup_staging()` の3つ全て）に共通の締め切りを1つだけ算出し、
    各メソッドに同じ `deadline_at` を渡す。こうすることで「確定処理全体が
    `PIN_PHOTO_CONFIRM_DEADLINE_SECONDS` 以内」という設計意図（backend-plan.md 5.5）を、
    原本とサムネイルの Put・staging 削除まで含めて実現する（PR #93 T3/T4: 以前は `commit()`
    冒頭の1回しか締め切りを見ておらず、Put が時間を使い切った後も（当時の）原本の Copy を
    開始しえた。
    `cleanup_staging()` も締め切りの対象外で無期限に実行されていた）。
    """

    def __init__(
        self,
        storage: ObjectStorage,
        *,
        max_bytes: int,
        max_pixels: int,
        thumbnail_max_edge: int,
        thumbnail_quality: int,
        concurrency: int,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._storage = storage
        self._max_bytes = max_bytes
        self._max_pixels = max_pixels
        self._thumbnail_max_edge = thumbnail_max_edge
        self._thumbnail_quality = thumbnail_quality
        self._concurrency = concurrency
        self._monotonic = monotonic

    def compute_deadline(self, deadline_seconds: float) -> float:
        """`prepare()`/`commit()` に共通で渡す締め切り（`monotonic()` 基準）を算出する。"""
        return self._monotonic() + deadline_seconds

    def prepare(
        self,
        uploads: list[PhotoUploadInput],
        *,
        user_id: uuid.UUID,
        deadline_at: float,
    ) -> list[PreparedPhoto]:
        """全枚数の検証とサムネイル生成を終える（backend-plan.md 5.5 手順4）。

        `InvalidPhotoError` / `ObjectStorageUnavailableError` を送出しうる。片方でも
        エラーがあれば、他が成功していても例外を送出する（`PinService` 側で
        ロールバックし、DB には何も書かない）。`deadline_at` は `compute_deadline()` で
        算出した、`commit()` と共有する単一の締め切り。
        """

        def process_one(item: PhotoUploadInput) -> PreparedPhoto:
            if self._monotonic() > deadline_at:
                raise ObjectStorageUnavailableError("Photo confirmation deadline exceeded")
            try:
                data = self._storage.get_bytes(item.staging_key, max_bytes=self._max_bytes)
            except ObjectNotFoundError as exc:
                raise InvalidPhotoError("Photo upload has no matching object in storage") from exc
            except ObjectTooLargeError as exc:
                raise InvalidPhotoError("Photo exceeds the size limit") from exc

            try:
                # 原本は EXIF などのメタデータを除去してから保存し、サムネイルも除去後の
                # バイト列から作る（保存する原本がデコードできることの検証を兼ねる）。
                cleaned = strip_jpeg_metadata(data)
                thumbnail = make_thumbnail(
                    cleaned,
                    max_edge=self._thumbnail_max_edge,
                    quality=self._thumbnail_quality,
                    max_pixels=self._max_pixels,
                )
            except InvalidImageError as exc:
                raise InvalidPhotoError(str(exc)) from exc

            return PreparedPhoto(
                upload_id=item.upload_id,
                staging_key=item.staging_key,
                original_key=original_key(user_id=user_id, upload_id=item.upload_id),
                thumbnail_key=thumbnail_key(
                    user_id=user_id, upload_id=item.upload_id, size=self._thumbnail_max_edge
                ),
                content_type="image/jpeg",
                byte_size=len(cleaned),
                width=thumbnail.original_width,
                height=thumbnail.original_height,
                thumbnail_bytes=thumbnail.jpeg_bytes,
                thumbnail_byte_size=len(thumbnail.jpeg_bytes),
                thumbnail_width=thumbnail.width,
                thumbnail_height=thumbnail.height,
                taken_at=item.taken_at,
                original_bytes=cleaned,
            )

        results: dict[uuid.UUID, PreparedPhoto] = {}
        errors: list[Exception] = []
        with ThreadPoolExecutor(max_workers=self._concurrency) as executor:
            futures = {executor.submit(process_one, item): item for item in uploads}
            for future, item in futures.items():
                try:
                    results[item.upload_id] = future.result()
                except Exception as exc:  # noqa: BLE001 - 種別ごとに下でまとめて優先度判定する
                    errors.append(exc)

        if errors:
            # 503（ストレージ不調・時間切れ）を優先する。再送で回復しうるため。
            for exc in errors:
                if isinstance(exc, ObjectStorageUnavailableError):
                    raise exc
            raise errors[0]

        return [results[item.upload_id] for item in uploads]

    def commit(self, prepared: list[PreparedPhoto], *, deadline_at: float) -> None:
        """検証済みの写真を確定する（サムネイル Put → 原本 Put）。

        原本は `prepare()` で検証・メタデータ除去したバイト列を Put する（ADR-009 決定35,
        SS-116。以前は staging から Copy していたが、検証の後に staging を上書きされると
        未検証のバイト列が原本に入った）。

        原本・サムネイルのキーは upload_id から決定的なので、再送では同じキーに
        上書きされるだけで冪等（backend-plan.md 5.5 手順5）。`prepare()` と同じ並列度・
        締め切りチェックを適用する（R2: 以前は逐次・無期限で、S3 が劣化した状況で
        Lambda の29秒ハード制限まで無制御に時間を消費しうる不具合があった）。

        締め切りはサムネイルの Put の前だけでなく、**その後（原本の Put の前）にも**確認する
        （PR #93 T3: 以前は `commit_one` の先頭1回しか確認しておらず、Put が時間予算を
        使い切った後も（当時の）原本の Copy が開始され、20秒を超えても成功を返しうる不具合が
        あった）。さらに、**全 Future を集約した後（＝最後の原本の Put が終わった後）にも**
        締め切りを確認する（個々の Put 呼び出し自体は `object_storage_read_timeout_seconds` で
        有界だが、
        並列実行の合計時間が締め切りを超えた状態で「全部成功」と扱ってしまうのを防ぐ）。
        超過していれば `ObjectStorageUnavailableError`（503。再送で回復しうる冪等な操作）
        にする。
        """

        def commit_one(item: PreparedPhoto) -> None:
            if self._monotonic() > deadline_at:
                raise ObjectStorageUnavailableError("Photo commit deadline exceeded")
            self._storage.put_bytes(
                item.thumbnail_key, item.thumbnail_bytes, content_type="image/jpeg"
            )
            if self._monotonic() > deadline_at:
                raise ObjectStorageUnavailableError("Photo commit deadline exceeded")
            self._storage.put_bytes(
                item.original_key, item.original_bytes, content_type=item.content_type
            )

        errors: list[Exception] = []
        with ThreadPoolExecutor(max_workers=self._concurrency) as executor:
            futures = [executor.submit(commit_one, item) for item in prepared]
            for future in futures:
                try:
                    future.result()
                except Exception as exc:  # noqa: BLE001 - 種別ごとに下でまとめて優先度判定する
                    errors.append(exc)

        if not errors and self._monotonic() > deadline_at:
            raise ObjectStorageUnavailableError("Photo commit deadline exceeded")

        if errors:
            # 503（ストレージ不調・時間切れ）を優先する。再送で回復しうるため。
            for exc in errors:
                if isinstance(exc, ObjectStorageUnavailableError):
                    raise exc
            raise errors[0]

    def cleanup_staging(self, prepared: list[PreparedPhoto], *, deadline_at: float) -> None:
        """commit 後に staging を best-effort で削除する（失敗は WARNING ログのみ。
        staging は S3 のライフサイクルで最終的に消える）。

        `prepare()`/`commit()` と同じ `deadline_at` を受け取り、締め切りを超えたら
        残りは削除せず打ち切って WARNING を1件出す（PR #93 T4: 以前はここだけ締め切りの
        対象外で、DB commit 後・レスポンス返却前に1件ずつ逐次実行されるため、S3 が
        劣化していると Lambda の実行タイムアウトまで無制御に時間を消費しうる不具合が
        あった）。呼び出し元は既に DB commit 済みのため、ここで打ち切っても整合性は
        壊れない（未削除の staging オブジェクトは S3 のライフサイクルで最終的に消える）。
        """
        for index, item in enumerate(prepared):
            if self._monotonic() > deadline_at:
                logger.warning(
                    "Skipping remaining staging cleanup: confirm deadline exceeded "
                    "(%d of %d objects not deleted; they will expire via the S3 lifecycle rule)",
                    len(prepared) - index,
                    len(prepared),
                )
                return
            try:
                self._storage.delete(item.staging_key)
            except ObjectStorageUnavailableError:
                logger.warning("Failed to delete staging object: %s", item.staging_key)
