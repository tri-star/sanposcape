"""service 層の戻り値（モデル）をレスポンススキーマへ変換するマッパー。

サムネイル・原本（`original_url`, ADR-009 決定16）の presigned GET を発行するため
`ObjectStorage` に依存する（`walks/mappers.py` とは異なりモデル単独の変換では完結しない）。
ネットワーク I/O は発生しない（presigned URL の生成はローカルの署名計算のみ、
`STORAGE_MODE=fake` も同様）。
"""

import uuid
from datetime import datetime, timedelta

from sanposcape.core.geo import GeoPoint
from sanposcape.integrations.aws.s3 import ObjectStorage, ObjectStorageUnavailableError
from sanposcape.pins.models import Pin, PinPhoto, PinTag
from sanposcape.pins.schemas import (
    PinListItemRead,
    PinPhotoListRead,
    PinPhotoPageRead,
    PinPhotoRead,
    PinPhotoThumbnailRead,
    PinRead,
    PinTagRead,
)
from sanposcape.sanpo_maps.models import SanpoMap
from sanposcape.sanpo_maps.schemas import SanpoMapSummaryRead


def to_sanpo_map_summary_read(
    sanpo_map: SanpoMap, *, current_user_id: uuid.UUID
) -> SanpoMapSummaryRead:
    return SanpoMapSummaryRead(
        id=sanpo_map.id,
        name=sanpo_map.name,
        is_default=bool(sanpo_map.is_default and sanpo_map.owner_user_id == current_user_id),
    )


def to_pin_tag_read(tag: PinTag) -> PinTagRead:
    return PinTagRead(id=tag.id, label=tag.label, created_by_user_id=tag.created_by_user_id)


def to_pin_photo_read(
    photo: PinPhoto,
    *,
    storage: ObjectStorage,
    base_url: str,
    download_url_ttl_seconds: int,
    now: datetime,
) -> PinPhotoRead:
    thumbnail: PinPhotoThumbnailRead | None = None
    if photo.thumbnail_s3_key is not None:
        try:
            url = storage.create_download_url(
                key=photo.thumbnail_s3_key, expires_in=download_url_ttl_seconds, base_url=base_url
            )
            thumbnail = PinPhotoThumbnailRead(
                url=url,
                width=photo.thumbnail_width or 0,
                height=photo.thumbnail_height or 0,
            )
        except ObjectStorageUnavailableError:
            # 生成待ち・storage 不調は null にする（クライアントはプレースホルダを出す）。
            thumbnail = None

    # 原本(サムネイルとは独立に署名する。片方だけ失敗してももう片方は返す, ADR-009 決定16・決定18)。
    original_url: str | None
    try:
        original_url = storage.create_download_url(
            key=photo.s3_key, expires_in=download_url_ttl_seconds, base_url=base_url
        )
    except ObjectStorageUnavailableError:
        original_url = None

    return PinPhotoRead(
        id=photo.id,
        upload_id=photo.upload_id,
        position=photo.position,
        width=photo.width,
        height=photo.height,
        byte_size=photo.byte_size,
        content_type=photo.content_type,
        thumbnail=thumbnail,
        original_url=original_url,
        urls_expire_at=now + timedelta(seconds=download_url_ttl_seconds),
        uploaded_by_user_id=photo.uploaded_by_user_id,
        created_at=photo.created_at,
    )


def to_pin_photo_list_read(
    photos: list[PinPhoto],
    *,
    storage: ObjectStorage,
    base_url: str,
    download_url_ttl_seconds: int,
    photo_count: int,
    now: datetime,
) -> PinPhotoListRead:
    return PinPhotoListRead(
        items=[
            to_pin_photo_read(
                photo,
                storage=storage,
                base_url=base_url,
                download_url_ttl_seconds=download_url_ttl_seconds,
                now=now,
            )
            for photo in photos
        ],
        photo_count=photo_count,
    )


def to_pin_read(
    pin: Pin,
    *,
    sanpo_map: SanpoMap,
    tags: list[PinTag],
    photos: list[PinPhoto],
    photo_count: int,
    current_user_id: uuid.UUID,
    storage: ObjectStorage,
    base_url: str,
    download_url_ttl_seconds: int,
    photos_limit: int,
    now: datetime,
) -> PinRead:
    return PinRead(
        id=pin.id,
        client_pin_id=pin.client_pin_id,
        sanpo_map=to_sanpo_map_summary_read(sanpo_map, current_user_id=current_user_id),
        name=pin.name,
        memo=pin.memo,
        location=GeoPoint(latitude=pin.latitude, longitude=pin.longitude),
        tags=[to_pin_tag_read(tag) for tag in tags],
        photos=[
            to_pin_photo_read(
                photo,
                storage=storage,
                base_url=base_url,
                download_url_ttl_seconds=download_url_ttl_seconds,
                now=now,
            )
            for photo in photos[:photos_limit]
        ],
        photo_count=photo_count,
        created_by_user_id=pin.created_by_user_id,
        client_walk_id=pin.client_walk_id,
        created_at=pin.created_at,
        updated_at=pin.updated_at,
    )


def to_pin_list_item_read(
    pin: Pin,
    *,
    tags: list[PinTag],
    cover_photo: PinPhoto | None,
    photo_count: int,
    storage: ObjectStorage,
    base_url: str,
    download_url_ttl_seconds: int,
    now: datetime,
) -> PinListItemRead:
    """`GET /pins` の一覧要素へ変換する。`memo` は含めない（ADR-009 決定15）。"""
    return PinListItemRead(
        id=pin.id,
        sanpo_map_id=pin.sanpo_map_id,
        name=pin.name,
        location=GeoPoint(latitude=pin.latitude, longitude=pin.longitude),
        tags=[to_pin_tag_read(tag) for tag in tags],
        cover_photo=(
            to_pin_photo_read(
                cover_photo,
                storage=storage,
                base_url=base_url,
                download_url_ttl_seconds=download_url_ttl_seconds,
                now=now,
            )
            if cover_photo is not None
            else None
        ),
        photo_count=photo_count,
        created_by_user_id=pin.created_by_user_id,
        created_at=pin.created_at,
        updated_at=pin.updated_at,
    )


def to_pin_photo_page_read(
    photos: list[PinPhoto],
    *,
    storage: ObjectStorage,
    base_url: str,
    download_url_ttl_seconds: int,
    photo_count: int,
    next_cursor: str | None,
    now: datetime,
) -> PinPhotoPageRead:
    """`GET /pins/{pin_id}/photos` の応答へ変換する（ADR-009 決定17）。"""
    return PinPhotoPageRead(
        items=[
            to_pin_photo_read(
                photo,
                storage=storage,
                base_url=base_url,
                download_url_ttl_seconds=download_url_ttl_seconds,
                now=now,
            )
            for photo in photos
        ],
        photo_count=photo_count,
        next_cursor=next_cursor,
    )
