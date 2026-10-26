"""移行バンドルを環境の地図に読み込む（SS-237。README「読み込み」）。

公開 API は使わず、DB と S3 に直接書く（旧データの日付を残すため）。

1. バンドルを検証する（DB・S3 に触れない）。1つでも外れたら何も書かずに止める。
2. 接続先が `--target` と合うことを確かめる（README「接続先の取り違えを防ぐ」）。
3. 移行先の地図・owner・容量を確かめる。`--dry-run` はここで件数を出して終わり、
   `--yes` が無ければ接続先と件数を出して止まる。
4. 対応表をバンドルの横に書いてから、ピンごとに1つのトランザクションで書く。
   既にあるピン（ID は uuid5 なので2回目も同じ）は、タグ・写真ごと DB も S3 も書かずに飛ばす。

出力は件数・容量・新しい ID だけ（README「スクリプトの出力」）。使い方は README「読み込みの手順」。
"""

import argparse
import io
import json
import logging
import math
import os
import sys
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import bundle
from PIL import Image
from PIL import UnidentifiedImageError as PillowUnidentifiedImageError
from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session, sessionmaker

import sanposcape.all_models  # noqa: F401 - リレーションの解決に全モデルの登録が要る
from sanposcape.config import Settings
from sanposcape.integrations.aws.s3 import FakeObjectStorage, ObjectStorage, build_object_storage
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.models import Pin, PinPhoto, PinTag, SanpoMap, SanpoMapMember
from sanposcape.sanpo_maps.photos.jpeg_metadata import strip_jpeg_metadata
from sanposcape.sanpo_maps.photos.photo_keys import original_key, thumbnail_key
from sanposcape.sanpo_maps.photos.repository import PinPhotoUploadRepository
from sanposcape.sanpo_maps.photos.thumbnails import InvalidImageError, make_thumbnail
from sanposcape.sanpo_maps.pins.schemas import (
    PIN_MEMO_MAX_LENGTH,
    PIN_NAME_MAX_LENGTH,
    PIN_TAGS_MAX_COUNT,
)
from sanposcape.sanpo_maps.pins.tag_labels import dedupe_tags, tag_key

#: uuid5 の名前空間（この移行専用。変えない。README「ID の決め方」）。
ID_NAMESPACE = uuid.UUID("3d38bef8-cb3f-416a-a856-7a9c78cb43bd")
SOURCE_KINDS = ("walkshare", "sanposcape")
TARGETS = ("local", "dev", "prod")
BACKEND_ROOT = Path(__file__).resolve().parents[2]
_SOURCE_ID_MAX_LENGTH = 128


class ImportBundleError(Exception):
    """読み込めない・書いてはいけない。文言には個人のデータを入れず、連番だけで場所を示す。"""


# ---------------------------------------------------------------------------
# バンドルの検証（DB・S3 に触れない）
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PhotoEntry:
    source_id: str
    path: Path
    sha256: str
    position: int
    taken_at: datetime | None
    created_at: datetime
    #: メタデータを除いた後の大きさ（容量の確認と `pin_photos.byte_size` に使う）。
    cleaned_byte_size: int


@dataclass(frozen=True)
class TagEntry:
    label: str
    label_key: str
    #: 配列の順に単調に増やした後の値（README「pins.json」）。
    created_at: datetime


@dataclass(frozen=True)
class PinEntry:
    source_id: str
    name: str | None
    memo: str | None
    latitude: float
    longitude: float
    visited: bool
    archived: bool
    created_at: datetime
    updated_at: datetime
    tags: list[TagEntry]
    photos: list[PhotoEntry]


@dataclass(frozen=True)
class LoadedBundle:
    kind: str
    source: dict[str, Any]
    pins: list[PinEntry]


def load_bundle(bundle_dir: Path, *, max_bytes: int, max_pixels: int) -> LoadedBundle:
    """バンドルを読み、README「読み込み」の項目をすべて確かめる。"""
    manifest = json.loads((bundle_dir / bundle.MANIFEST_FILE).read_text(encoding="utf-8"))
    if manifest.get("format_version") != bundle.FORMAT_VERSION:
        raise ImportBundleError("知らない format_version です")
    source = manifest.get("source")
    if not isinstance(source, dict) or source.get("kind") not in SOURCE_KINDS:
        raise ImportBundleError("source.kind が想定の値ではありません")

    pins_bytes = (bundle_dir / bundle.PINS_FILE).read_bytes()
    if bundle.sha256_hex(pins_bytes) != manifest.get("pins_sha256"):
        raise ImportBundleError("pins.json の sha256 が manifest と合いません")
    if (bundle_dir / bundle.PHOTOS_DIR).is_symlink():
        raise ImportBundleError("photos/ が symlink です")

    pins: list[PinEntry] = []
    seen_pins: set[str] = set()
    seen_photos: set[str] = set()
    for index, raw in enumerate(json.loads(pins_bytes)["pins"]):
        try:
            pin = _load_pin(raw, bundle_dir, max_bytes=max_bytes, max_pixels=max_pixels)
        except ImportBundleError as exc:
            raise ImportBundleError(f"ピン {index}: {exc}") from None
        except (KeyError, TypeError, ValueError, AttributeError) as exc:
            # ValueError（dedupe_tags など）の文言にはタグなどの値が入るので、型だけを出す。
            raise ImportBundleError(f"ピン {index}: {type(exc).__name__}") from None
        if pin.source_id in seen_pins:
            raise ImportBundleError(f"ピン {index}: source_id が重複しています")
        seen_pins.add(pin.source_id)
        for photo in pin.photos:
            if photo.source_id in seen_photos:
                raise ImportBundleError(f"ピン {index}: 写真の source_id が重複しています")
            seen_photos.add(photo.source_id)
        pins.append(pin)

    photos = [photo for pin in pins for photo in pin.photos]
    counts = {"pins": len(pins), "photos": len(photos), "tags": sum(len(p.tags) for p in pins)}
    if manifest.get("counts") != counts:
        raise ImportBundleError("件数が manifest と合いません")
    return LoadedBundle(kind=source["kind"], source=source, pins=pins)


def _load_pin(
    raw: dict[str, Any], bundle_dir: Path, *, max_bytes: int, max_pixels: int
) -> PinEntry:
    source_id = raw["source_id"]
    # uuid5 の名前は `:` でつなぐので、`:` を含むとほかのピンのタグの名前とぶつかりうる。
    if (
        not isinstance(source_id, str)
        or not 0 < len(source_id) <= _SOURCE_ID_MAX_LENGTH
        or ":" in source_id
    ):
        raise ImportBundleError("source_id が想定の形ではありません")
    latitude, longitude = _coordinate(raw["latitude"]), _coordinate(raw["longitude"])
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise ImportBundleError("位置が範囲の外です")
    if not isinstance(raw["visited"], bool) or not isinstance(raw["archived"], bool):
        raise ImportBundleError("visited・archived が真偽値ではありません")

    raw_tags = raw["tags"]
    if len(raw_tags) > PIN_TAGS_MAX_COUNT:
        raise ImportBundleError("タグが多すぎます")
    labels = [tag["label"] for tag in raw_tags]
    # 黙って落とすと created_at との対応がずれるので、正規化・重複除去の結果と完全に一致しなければ
    # 止める。
    if dedupe_tags(labels) != labels:
        raise ImportBundleError("タグが正規化・重複除去の結果と一致しません")
    tags: list[TagEntry] = []
    for tag in raw_tags:
        created_at = bundle.parse_timestamp(tag["created_at"])
        if tags and created_at <= tags[-1].created_at:
            # タグは (created_at, id) の順に並ぶので、配列の順になるよう 1 マイクロ秒ずつ
            # 繰り上げる。
            created_at = tags[-1].created_at + timedelta(microseconds=1)
        tags.append(
            TagEntry(label=tag["label"], label_key=tag_key(tag["label"]), created_at=created_at)
        )

    photos = [
        _load_photo(raw_photo, position, bundle_dir, max_bytes=max_bytes, max_pixels=max_pixels)
        for position, raw_photo in enumerate(raw["photos"])
    ]
    return PinEntry(
        source_id=source_id,
        name=_text_or_none(raw["name"], PIN_NAME_MAX_LENGTH, "名前"),
        memo=_text_or_none(raw["memo"], PIN_MEMO_MAX_LENGTH, "メモ"),
        latitude=latitude,
        longitude=longitude,
        visited=raw["visited"],
        archived=raw["archived"],
        created_at=bundle.parse_timestamp(raw["created_at"]),
        updated_at=bundle.parse_timestamp(raw["updated_at"]),
        tags=tags,
        photos=photos,
    )


def _load_photo(
    raw: dict[str, Any], position: int, bundle_dir: Path, *, max_bytes: int, max_pixels: int
) -> PhotoEntry:
    where = f"写真 {position}"
    if raw["position"] != position:
        raise ImportBundleError(f"{where}: position が 0 からの連番ではありません")
    source_id = raw["source_id"]
    if not bundle.is_valid_source_id(source_id) or raw["file"] != bundle.photo_file(source_id):
        raise ImportBundleError(f"{where}: file が photos/<source_id>.jpg ではありません")
    path = bundle_dir / raw["file"]
    if path.is_symlink() or not path.is_file():
        raise ImportBundleError(f"{where}: ファイルが無いか symlink です")
    data = path.read_bytes()
    if len(data) != raw["byte_size"] or bundle.sha256_hex(data) != raw["sha256"]:
        raise ImportBundleError(f"{where}: 大きさか sha256 が pins.json と合いません")
    try:
        cleaned = strip_jpeg_metadata(data)
    except InvalidImageError:
        raise ImportBundleError(f"{where}: JPEG として読めません") from None
    if len(cleaned) > max_bytes:
        raise ImportBundleError(f"{where}: 大きさが上限を超えています")
    _check_jpeg_header(cleaned, max_pixels=max_pixels, where=where)
    taken_at = raw["taken_at"]
    return PhotoEntry(
        source_id=source_id,
        path=path,
        sha256=raw["sha256"],
        position=position,
        taken_at=bundle.parse_timestamp(taken_at) if taken_at is not None else None,
        created_at=bundle.parse_timestamp(raw["created_at"]),
        cleaned_byte_size=len(cleaned),
    )


def _check_jpeg_header(data: bytes, *, max_pixels: int, where: str) -> None:
    """形式と画素数をヘッダーだけで確かめる（全画素のデコードは書くときのサムネイル作成で行う）。"""
    try:
        with Image.open(io.BytesIO(data)) as image:
            image_format, (width, height) = image.format, image.size
    except (OSError, PillowUnidentifiedImageError, ValueError, Image.DecompressionBombError):
        raise ImportBundleError(f"{where}: 画像として読めません") from None
    if image_format != "JPEG":
        raise ImportBundleError(f"{where}: JPEG ではありません")
    if width * height > max_pixels:
        raise ImportBundleError(f"{where}: 画素数が上限を超えています")


def _coordinate(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ImportBundleError("位置が数値ではありません")
    return float(value)


def _text_or_none(value: Any, max_length: int, label: str) -> str | None:
    """None か、前後に空白の無い空でない文字列（API の PinCreate が正規化した後の形）。"""
    if value is None:
        return None
    if not isinstance(value, str) or not value or value != value.strip():
        raise ImportBundleError(
            f"{label}が正規化した形（前後の空白なし・空なら null）ではありません"
        )
    if len(value) > max_length:
        raise ImportBundleError(f"{label}が {max_length} 文字を超えています")
    return value


# ---------------------------------------------------------------------------
# ID（README「ID の決め方」）
# ---------------------------------------------------------------------------


def migration_id(kind: str, sanpo_map_id: uuid.UUID, *parts: str) -> uuid.UUID:
    return uuid.uuid5(ID_NAMESPACE, ":".join([kind, str(sanpo_map_id), *parts]))


@dataclass(frozen=True)
class PhotoIds:
    id: uuid.UUID
    upload_id: uuid.UUID
    original_key: str
    thumbnail_key: str


def pin_id_for(loaded: LoadedBundle, sanpo_map_id: uuid.UUID, pin: PinEntry) -> uuid.UUID:
    return migration_id(loaded.kind, sanpo_map_id, "pin", pin.source_id)


def tag_id_for(
    loaded: LoadedBundle, sanpo_map_id: uuid.UUID, pin: PinEntry, tag: TagEntry
) -> uuid.UUID:
    return migration_id(loaded.kind, sanpo_map_id, "tag", pin.source_id, tag.label_key)


def photo_ids_for(
    loaded: LoadedBundle,
    sanpo_map_id: uuid.UUID,
    photo: PhotoEntry,
    *,
    user_id: uuid.UUID,
    thumbnail_size: int,
) -> PhotoIds:
    upload_id = migration_id(loaded.kind, sanpo_map_id, "upload", photo.source_id)
    return PhotoIds(
        id=migration_id(loaded.kind, sanpo_map_id, "photo", photo.source_id),
        upload_id=upload_id,
        original_key=original_key(user_id=user_id, upload_id=upload_id),
        thumbnail_key=thumbnail_key(user_id=user_id, upload_id=upload_id, size=thumbnail_size),
    )


# ---------------------------------------------------------------------------
# 書き込み
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Plan:
    """書く前の確認の結果（件数・容量）。"""

    pins_to_insert: int
    pins_existing: int
    photos_to_insert: int
    photos_existing: int
    tags_to_insert: int
    bytes_to_add: int
    quota_used_bytes: int
    quota_limit_bytes: int

    def summary(self) -> dict[str, int]:
        return {
            "pins_to_insert": self.pins_to_insert,
            "pins_existing": self.pins_existing,
            "photos_to_insert": self.photos_to_insert,
            "photos_existing": self.photos_existing,
            "tags_to_insert": self.tags_to_insert,
            "bytes_to_add": self.bytes_to_add,
            "quota_used_bytes": self.quota_used_bytes,
            "quota_limit_bytes": self.quota_limit_bytes,
        }


class BundleImporter:
    """1つのバンドルを1つの地図に読み込む。`position` は例外のときにどこで止まったかを示す。"""

    def __init__(
        self,
        loaded: LoadedBundle,
        *,
        sanpo_map_id: uuid.UUID,
        user_id: uuid.UUID,
        session_factory: Callable[[], Session],
        storage: ObjectStorage,
        settings: Settings,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._loaded = loaded
        self.sanpo_map_id = sanpo_map_id
        self._user_id = user_id
        self._session_factory = session_factory
        self._storage = storage
        self._settings = settings
        self._now = now
        self.position = "書く前の確認"

    def _pin_id(self, pin: PinEntry) -> uuid.UUID:
        return pin_id_for(self._loaded, self.sanpo_map_id, pin)

    def _photo_ids(self, photo: PhotoEntry) -> PhotoIds:
        return photo_ids_for(
            self._loaded,
            self.sanpo_map_id,
            photo,
            user_id=self._user_id,
            thumbnail_size=self._settings.pin_photo_thumbnail_max_edge_px,
        )

    def plan(self) -> Plan:
        """移行先の地図・owner・容量を確かめ、入る件数と飛ばす件数を数える（何も書かない）。"""
        with self._session_factory() as db:
            sanpo_map = db.get(SanpoMap, self.sanpo_map_id)
            if sanpo_map is None:
                raise ImportBundleError("移行先の地図がありません")
            if sanpo_map.owner_user_id != self._user_id:
                raise ImportBundleError("指定したユーザーは移行先の地図の owner ではありません")
            # 共有中の地図に入れると、移したピン・写真がほかのメンバーに見える。
            # 移行先は新しく作った地図にする（README「読み込み」）。
            others = db.scalar(
                select(func.count())
                .select_from(SanpoMapMember)
                .where(
                    SanpoMapMember.sanpo_map_id == self.sanpo_map_id,
                    SanpoMapMember.user_id != self._user_id,
                )
            )
            if others:
                raise ImportBundleError("移行先の地図に owner 以外のメンバーがいます")
            existing = self._existing_pin_ids(db)
            new_pins = [pin for pin in self._loaded.pins if self._pin_id(pin) not in existing]
            new_bytes = sum(photo.cleaned_byte_size for pin in new_pins for photo in pin.photos)
            used = self._used_bytes_locked(db)
            db.rollback()  # ロックを外す
        quota = self._settings.pin_photo_user_quota_bytes
        if used + new_bytes > quota:
            raise ImportBundleError(
                f"容量の上限を超えます（使用中 {used}・追加 {new_bytes}・上限 {quota} バイト）"
            )
        all_photos = sum(len(pin.photos) for pin in self._loaded.pins)
        new_photos = sum(len(pin.photos) for pin in new_pins)
        return Plan(
            pins_to_insert=len(new_pins),
            pins_existing=len(self._loaded.pins) - len(new_pins),
            photos_to_insert=new_photos,
            photos_existing=all_photos - new_photos,
            tags_to_insert=sum(len(pin.tags) for pin in new_pins),
            bytes_to_add=new_bytes,
            quota_used_bytes=used,
            quota_limit_bytes=quota,
        )

    def mapping(self) -> dict[str, Any]:
        """対応表（元の ID → 新しい ID・S3 のキー）。戻すときと照合に使う。"""
        return {
            "sanpo_map_id": str(self.sanpo_map_id),
            "source": self._loaded.source,
            "pins": [
                {
                    "source_id": pin.source_id,
                    "id": str(self._pin_id(pin)),
                    "photos": [
                        {
                            "source_id": photo.source_id,
                            "id": str(ids.id),
                            "upload_id": str(ids.upload_id),
                            "s3_key": ids.original_key,
                            "thumbnail_s3_key": ids.thumbnail_key,
                        }
                        for photo in pin.photos
                        for ids in [self._photo_ids(photo)]
                    ],
                }
                for pin in self._loaded.pins
            ],
        }

    def write(self) -> dict[str, int]:
        """ピンごとに1つのトランザクションで書く。既にあるピンはタグ・写真ごと飛ばす。"""
        inserted = {"pins": 0, "photos": 0, "tags": 0, "photo_bytes": 0}
        for index, pin in enumerate(self._loaded.pins):
            self.position = f"ピン {index}"
            with self._session_factory() as db:
                if self._write_pin(db, index, pin):
                    inserted["pins"] += 1
                    inserted["photos"] += len(pin.photos)
                    inserted["tags"] += len(pin.tags)
                    inserted["photo_bytes"] += sum(p.cleaned_byte_size for p in pin.photos)
        if inserted["pins"]:
            self.position = "地図の更新日時"
            with self._session_factory() as db:
                # アプリでピンを足したとき（mark_used）と同じく、最近使った地図として先頭に出す。
                SanpoMapRepository(db).touch(sanpo_map_id=self.sanpo_map_id, now=self._now())
                db.commit()
        self.position = "完了"
        return inserted

    def _write_pin(self, db: Session, index: int, pin: PinEntry) -> bool:
        # 同じユーザーのアプリの写真の枠の発行・確定と直列にし、容量をこのピンの分で確かめ直す。
        used = self._used_bytes_locked(db)
        pin_id = self._pin_id(pin)
        if db.get(Pin, pin_id) is not None:
            db.rollback()
            return False
        new_bytes = sum(photo.cleaned_byte_size for photo in pin.photos)
        if used + new_bytes > self._settings.pin_photo_user_quota_bytes:
            raise ImportBundleError("容量の上限を超えます（書いている途中でほかの写真が増えた）")

        db.add(
            Pin(
                id=pin_id,
                sanpo_map_id=self.sanpo_map_id,
                created_by_user_id=self._user_id,
                # (created_by_user_id, client_pin_id) の一意制約を二重登録の歯止めにする。
                client_pin_id=pin_id,
                name=pin.name,
                memo=pin.memo,
                latitude=pin.latitude,
                longitude=pin.longitude,
                client_walk_id=None,
                visited=pin.visited,
                archived=pin.archived,
                created_at=pin.created_at,
                updated_at=pin.updated_at,
            )
        )
        db.flush()
        for tag in pin.tags:
            db.add(
                PinTag(
                    id=tag_id_for(self._loaded, self.sanpo_map_id, pin, tag),
                    pin_id=pin_id,
                    label=tag.label,
                    label_key=tag.label_key,
                    created_by_user_id=self._user_id,
                    created_at=tag.created_at,
                )
            )
        for photo in pin.photos:
            self.position = f"ピン {index} の写真 {photo.position}"
            db.add(self._put_photo(pin_id, photo))
        db.commit()
        return True

    def _put_photo(self, pin_id: uuid.UUID, photo: PhotoEntry) -> PinPhoto:
        """メタデータ除去 → サムネイル → S3（サムネイル・原本）。`staging/` は通さない。"""
        data = photo.path.read_bytes()
        if bundle.sha256_hex(data) != photo.sha256:
            raise ImportBundleError("確かめた後で写真のファイルが変わりました")
        cleaned = strip_jpeg_metadata(data)
        thumbnail = make_thumbnail(
            cleaned,
            max_edge=self._settings.pin_photo_thumbnail_max_edge_px,
            quality=self._settings.pin_photo_thumbnail_jpeg_quality,
            max_pixels=self._settings.pin_photo_max_pixels,
        )
        ids = self._photo_ids(photo)
        self._storage.put_bytes(ids.thumbnail_key, thumbnail.jpeg_bytes, content_type="image/jpeg")
        self._storage.put_bytes(ids.original_key, cleaned, content_type="image/jpeg")
        return PinPhoto(
            id=ids.id,
            pin_id=pin_id,
            uploaded_by_user_id=self._user_id,
            upload_id=ids.upload_id,
            s3_key=ids.original_key,
            content_type="image/jpeg",
            byte_size=len(cleaned),
            width=thumbnail.original_width,
            height=thumbnail.original_height,
            thumbnail_s3_key=ids.thumbnail_key,
            thumbnail_byte_size=len(thumbnail.jpeg_bytes),
            thumbnail_width=thumbnail.width,
            thumbnail_height=thumbnail.height,
            position=photo.position,
            taken_at=photo.taken_at,
            created_at=photo.created_at,
        )

    def _existing_pin_ids(self, db: Session) -> set[uuid.UUID]:
        pin_ids = [self._pin_id(pin) for pin in self._loaded.pins]
        return set(db.scalars(select(Pin.id).where(Pin.id.in_(pin_ids))))

    def _used_bytes_locked(self, db: Session) -> int:
        """ユーザーのロックを取り、確定済み + アプリで先行アップロード中の枠の大きさを返す。"""
        repository = PinPhotoUploadRepository(db)
        repository.acquire_user_lock(user_id=self._user_id)
        return repository.sum_attached_bytes(user_id=self._user_id) + (
            repository.sum_reserved_bytes(user_id=self._user_id, now=self._now())
        )


# ---------------------------------------------------------------------------
# 接続先（README「接続先の取り違えを防ぐ」）
# ---------------------------------------------------------------------------


def build_settings(target: str, environ: dict[str, str] | None = None) -> Settings:
    """`--target` に合う Settings を作る。local 以外では `.env` を読まない。"""
    environ = os.environ if environ is None else environ
    if target == "local":
        # `.env` は compose 用で DB_HOST を持たず、既定の `db` はホストから引けない。
        settings = Settings(db_host=environ.get("DB_HOST", "localhost"))
        if settings.env != "local":
            raise ImportBundleError("--target local なのに ENV が local ではありません")
        if settings.database_dsn:
            raise ImportBundleError("--target local なのに DATABASE_DSN が設定されています")
        if settings.storage_mode != "fake" or not settings.dev_storage_dir:
            raise ImportBundleError(
                "--target local では STORAGE_MODE=fake と DEV_STORAGE_DIR が要ります"
            )
        return settings
    # botocore は AWS_ENDPOINT_URL（_S3 など）を読む。残っていると S3 だけ別の宛先に向く
    # （SSM・STS の照合は AWS に向いたまま通る）。
    endpoints = sorted(name for name in environ if name.startswith("AWS_ENDPOINT_URL"))
    if endpoints:
        raise ImportBundleError(f"AWS の宛先を変える環境変数があります: {', '.join(endpoints)}")
    settings = Settings(_env_file=None)
    missing = [
        name
        for name, value in [
            ("DATABASE_DSN", settings.database_dsn),
            ("PIN_PHOTO_BUCKET_NAME", settings.pin_photo_bucket_name),
            ("PIN_PHOTO_BUCKET_REGION", settings.pin_photo_bucket_region),
        ]
        if not value
    ]
    if missing:
        raise ImportBundleError(f"環境変数がありません: {', '.join(missing)}")
    if settings.storage_mode != "real":
        raise ImportBundleError(f"--target {target} では STORAGE_MODE=real が要ります")
    return settings


def verify_remote_target(
    target: str,
    settings: Settings,
    *,
    expected_account_id: str,
    expected_db_host: str,
    ssm: Any,
    sts: Any,
) -> None:
    """バケット名が `--target` の SSM の値と、資格情報のアカウント・DB のホスト名が指定と
    一致することを確かめる。

    シェルに前の作業の環境変数が残っていても、別の環境に書かないため。DSN は値があるかだけで
    なくホスト名を照合する（dev の DSN が残ったまま prod のバケットに写真を書くと、prod の
    どの利用者の prefix にも入らず、地図・アカウントの削除でも消えない写真が残る）。
    """
    url = make_url(settings.database_url)
    # psycopg はクエリの host・hostaddr を netloc より優先するので、照合したホストと違う所に
    # 繋ぎうる。
    if {"host", "hostaddr"} & set(url.query):
        raise ImportBundleError("DATABASE_DSN のクエリに host・hostaddr があります")
    if url.host != expected_db_host:
        raise ImportBundleError("DATABASE_DSN のホスト名が --db-host と違います")
    name = f"/sanposcape/{target}/platform/pin_photos/bucket_name"
    if ssm.get_parameter(Name=name)["Parameter"]["Value"] != settings.pin_photo_bucket_name:
        raise ImportBundleError(f"PIN_PHOTO_BUCKET_NAME が {name} の値と違います")
    if sts.get_caller_identity()["Account"] != expected_account_id:
        raise ImportBundleError("AWS の資格情報のアカウントが --aws-account-id と違います")


def build_storage(target: str, settings: Settings) -> tuple[ObjectStorage, str]:
    """書き込み先のストレージと、書く前に表示する名前を返す。"""
    if target == "local":
        root = Path(settings.dev_storage_dir)
        root = root if root.is_absolute() else BACKEND_ROOT / root
        return FakeObjectStorage(secret=settings.auth_jwt_secret, root_dir=root), f"fake:{root}"
    return build_object_storage(settings), f"s3:{settings.pin_photo_bucket_name}"


# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------


def mapping_path(bundle_dir: Path, target: str, sanpo_map_id: uuid.UUID) -> Path:
    return bundle_dir.parent / f"{bundle_dir.name}.import-{target}-{sanpo_map_id}.json"


def prepare_importer(
    *,
    bundle_dir: Path,
    sanpo_map_id: uuid.UUID,
    user_id: uuid.UUID,
    settings: Settings,
    session_factory: Callable[[], Session],
    storage: ObjectStorage,
) -> BundleImporter:
    """バンドルを検証して、読み込みの準備をする（何も書かない）。"""
    loaded = load_bundle(
        bundle_dir,
        max_bytes=settings.pin_photo_max_bytes,
        max_pixels=settings.pin_photo_max_pixels,
    )
    return BundleImporter(
        loaded,
        sanpo_map_id=sanpo_map_id,
        user_id=user_id,
        session_factory=session_factory,
        storage=storage,
        settings=settings,
    )


def execute(
    importer: BundleImporter,
    *,
    target: str,
    bundle_dir: Path,
    dry_run: bool,
    yes: bool,
    destination: dict[str, str],
) -> dict[str, Any]:
    """確かめてから書き、出力する報告を返す。`destination` は書く前に表示する接続先。"""
    plan = importer.plan()
    report: dict[str, Any] = {"target": target, **destination, "plan": plan.summary()}
    if dry_run or not yes:
        report["result"] = "dry-run" if dry_run else "stopped: --yes を付けて実行し直すと書く"
        return report
    path = mapping_path(bundle_dir, target, importer.sanpo_map_id)
    bundle.write_private_bytes(path, bundle.encode_json(importer.mapping()))
    report["inserted"] = importer.write()
    report["result"] = "done"
    return report


def describe_error(exc: BaseException) -> str:
    """例外を、個人のデータの入らない文言にする（README「スクリプトの出力」）。"""
    if isinstance(exc, (ImportBundleError, bundle.BundleError)):
        return str(exc)
    if isinstance(exc, DBAPIError):
        # DETAIL（Key (...)=(...)・Failing row contains (...)）にはユーザー ID・タグ・座標が
        # 入るので出さない。
        orig = exc.orig
        diag = getattr(orig, "diag", None)
        return (
            f"{type(exc).__name__} sqlstate={getattr(orig, 'sqlstate', None)} "
            f"constraint={getattr(diag, 'constraint_name', None)}"
        )
    return type(exc).__name__


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="移行バンドルを環境の地図に読み込む")
    parser.add_argument("--target", choices=TARGETS, required=True)
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--map-id", type=uuid.UUID, required=True)
    parser.add_argument("--user-id", type=uuid.UUID, required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--yes", action="store_true", help="接続先と件数を見た後で、書く")
    parser.add_argument("--aws-account-id", help="dev・prod で、資格情報のアカウントと照合する")
    parser.add_argument("--db-host", help="dev・prod で、DATABASE_DSN のホスト名と照合する")
    args = parser.parse_args(argv)
    # sanposcape のロガーの WARNING には S3 のキー（ユーザー ID が入る）などが出うる。
    logging.getLogger("sanposcape").setLevel(logging.ERROR)

    importer: BundleImporter | None = None
    try:
        bundle_dir = bundle.require_inside_work_dir(args.bundle)
        settings = build_settings(args.target)
        if args.target != "local":
            if not args.aws_account_id or not args.db_host:
                raise ImportBundleError(
                    f"--target {args.target} では --aws-account-id と --db-host が要ります"
                )
            import boto3

            # ~/.aws/config のプロファイルの endpoint_url（S3 だけの指定も）で、SSM・STS の照合は
            # AWS に向いたまま S3 だけ別の宛先に書くことがないよう、設定された宛先を使わない。
            os.environ["AWS_IGNORE_CONFIGURED_ENDPOINT_URLS"] = "true"
            region = settings.pin_photo_bucket_region
            verify_remote_target(
                args.target,
                settings,
                expected_account_id=args.aws_account_id,
                expected_db_host=args.db_host,
                ssm=boto3.client("ssm", region_name=region),
                sts=boto3.client("sts", region_name=region),
            )
        storage, storage_name = build_storage(args.target, settings)
        engine = create_engine(settings.database_url, **settings.sqlalchemy_engine_kwargs)
        importer = prepare_importer(
            bundle_dir=bundle_dir,
            sanpo_map_id=args.map_id,
            user_id=args.user_id,
            settings=settings,
            session_factory=sessionmaker(bind=engine, autoflush=False),
            storage=storage,
        )
        report = execute(
            importer,
            target=args.target,
            bundle_dir=bundle_dir,
            dry_run=args.dry_run,
            yes=args.yes,
            destination={
                "db_host": make_url(settings.database_url).host or "",
                "storage": storage_name,
            },
        )
    except Exception as exc:  # noqa: BLE001 - 文言・トレースバックに個人のデータが入りうる
        where = f"（{importer.position}）" if importer is not None else ""
        print(f"error{where}: {describe_error(exc)}", file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
