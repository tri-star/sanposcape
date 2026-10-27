"""環境の sanposcape の地図を、移行バンドルに書き出す（SS-239。
README「sanposcape の地図の書き出し」）。

DB と S3 は読み取りだけ。

1. 接続先が `--target` と合うことを確かめる（読み込みと同じ。README「接続先の取り違えを防ぐ」）。
2. 地図のピン・タグ・写真を、読み取り専用の1つのトランザクション（REPEATABLE READ）で読む。
   S3 を読む前に閉じる（約 1GiB の取得の間トランザクションを開いたままにしない）。
3. 写真の原本を S3 から1枚ずつ取り、そのままバンドルに書く（再圧縮しない）。
   `pins.json`・`manifest.json` は最後に書く（manifest があれば完成）。

出力は件数・容量・作成者ごとのピンの件数だけ（README「スクリプトの出力」）。
"""

import argparse
import json
import logging
import sys
import uuid
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import bundle
import import_bundle as ib
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session, sessionmaker

from sanposcape.integrations.aws.s3 import ObjectStorage
from sanposcape.sanpo_maps.models import Pin, PinPhoto, PinTag, SanpoMap
from sanposcape.sanpo_maps.pins.tag_labels import dedupe_tags

#: prod からは書き出さない（prod に書くのは「dev の地図 → バンドル → prod の地図」の経路だけ）。
TARGETS = ("local", "dev")


class ExportError(Exception):
    """書き出せない。文言には個人のデータを入れず、バンドルの中の連番だけで場所を示す。"""


# ---------------------------------------------------------------------------
# DB を読む
# ---------------------------------------------------------------------------


def create_read_only_engine(url: str, engine_kwargs: Mapping[str, Any]) -> Engine:
    """既定のトランザクションを読み取り専用にした engine（`settings.sqlalchemy_engine_kwargs`
    を通して `hide_parameters` を効かせる）。
    """
    if "options" in make_url(url).query:
        # 接続の引数の options で DSN の options を上書きするので、DSN 側の指定を黙って落とさない。
        raise ExportError("DATABASE_DSN のクエリに options があります")
    kwargs = dict(engine_kwargs)
    kwargs["connect_args"] = {
        **kwargs.get("connect_args", {}),
        "options": "-c default_transaction_read_only=on",
    }
    return create_engine(url, isolation_level="REPEATABLE READ", **kwargs)


@dataclass(frozen=True)
class PhotoSource:
    """バンドルに入れる写真1枚（原本を取る前）。"""

    source_id: str
    s3_key: str
    byte_size: int
    width: int
    height: int
    taken_at: datetime | None
    created_at: datetime


@dataclass(frozen=True)
class PinSource:
    """バンドルに入れるピン1件。"""

    record: dict[str, Any]  # pins.json の1件から photos を除いたもの
    photos: list[PhotoSource]


@dataclass(frozen=True)
class MapSnapshot:
    pins: list[PinSource]
    #: 地図の全ピン（`--created-by` で絞る前）の、作成者ごとの件数（多い順。ID は持たない）。
    creator_pin_counts: list[int]


def read_map(
    session_factory: Callable[[], Session],
    sanpo_map_id: uuid.UUID,
    *,
    created_by: uuid.UUID | None = None,
) -> MapSnapshot:
    """地図のピン・タグ・写真を1つのトランザクションで読む（アプリで編集されても食い違わない）。"""
    with session_factory() as db:
        # 接続の options が効いていない（pooler が落とすなど）なら、書けてしまう接続で読まない。
        if db.scalar(text("SHOW transaction_read_only")) != "on":
            raise ExportError("DB の接続が読み取り専用になっていません")
        if db.get(SanpoMap, sanpo_map_id) is None:
            raise ExportError("地図がありません")
        creator_pin_counts = sorted(
            db.scalars(
                select(func.count())
                .select_from(Pin)
                .where(Pin.sanpo_map_id == sanpo_map_id)
                .group_by(Pin.created_by_user_id)
            ),
            reverse=True,
        )
        pin_filter = [Pin.sanpo_map_id == sanpo_map_id]
        if created_by is not None:
            pin_filter.append(Pin.created_by_user_id == created_by)
        # 地図の画面と同じ (created_at, id) の順。
        pins = db.scalars(select(Pin).where(*pin_filter).order_by(Pin.created_at, Pin.id)).all()
        tags: dict[uuid.UUID, list[PinTag]] = {}
        for tag in db.scalars(
            select(PinTag)
            .join(Pin, PinTag.pin_id == Pin.id)
            .where(*pin_filter)
            # mobile が並べる順（ORDER BY created_at, id）。
            .order_by(PinTag.created_at, PinTag.id)
        ):
            tags.setdefault(tag.pin_id, []).append(tag)
        photos: dict[uuid.UUID, list[PinPhoto]] = {}
        for photo in db.scalars(
            select(PinPhoto)
            .join(Pin, PinPhoto.pin_id == Pin.id)
            .where(*pin_filter)
            .order_by(PinPhoto.position, PinPhoto.id)
        ):
            photos.setdefault(photo.pin_id, []).append(photo)

        sources = []
        for index, pin in enumerate(pins):
            try:
                sources.append(_pin_source(pin, tags.get(pin.id, []), photos.get(pin.id, [])))
            except ExportError as exc:
                raise ExportError(f"ピン {index}: {exc}") from None
            except ValueError as exc:
                # dedupe_tags の ValueError の文言にはタグが入るので、型だけを出す。
                raise ExportError(f"ピン {index}: {type(exc).__name__}") from None
        db.rollback()
    return MapSnapshot(pins=sources, creator_pin_counts=creator_pin_counts)


def _pin_source(pin: Pin, tags: list[PinTag], photos: list[PinPhoto]) -> PinSource:
    labels = [tag.label for tag in tags]
    # 読み込みは正規化・重複除去の結果と一致しなければ止まるので、先に知らせる。
    if dedupe_tags(labels) != labels:
        raise ExportError("タグが正規化・重複除去の結果と一致しません")
    record = {
        "source_id": str(pin.id),
        "name": _normalized_or_none(pin.name, "名前"),
        "memo": _normalized_or_none(pin.memo, "メモ"),
        "latitude": pin.latitude,
        "longitude": pin.longitude,
        "visited": pin.visited,
        "archived": pin.archived,
        "created_at": bundle.format_timestamp(pin.created_at),
        "updated_at": bundle.format_timestamp(pin.updated_at),
        "tags": [
            {"label": tag.label, "created_at": bundle.format_timestamp(tag.created_at)}
            for tag in tags
        ],
    }
    return PinSource(
        record=record,
        photos=[
            PhotoSource(
                source_id=str(photo.id),
                s3_key=photo.s3_key,
                byte_size=photo.byte_size,
                width=photo.width,
                height=photo.height,
                taken_at=photo.taken_at,
                created_at=photo.created_at,
            )
            for photo in photos
        ],
    )


def _normalized_or_none(value: str | None, label: str) -> str | None:
    """API の PinCreate が正規化した後の形（前後の空白なし・空なら null）でなければ止める。

    黙って直すと元の地図と違って見えうるので、直さない。
    """
    if value is not None and (not value or value != value.strip()):
        raise ExportError(f"{label}が正規化した形（前後の空白なし・空なら null）ではありません")
    return value


# ---------------------------------------------------------------------------
# バンドルを書く
# ---------------------------------------------------------------------------


@dataclass
class ExportStats:
    max_photo_bytes: int = 0
    stale_files_removed: int = 0


def export_bundle(
    snapshot: MapSnapshot,
    *,
    out_dir: Path,
    source: dict[str, Any],
    storage: ObjectStorage,
    max_bytes: int,
    exported_at: datetime,
) -> tuple[dict[str, Any], ExportStats]:
    """原本を S3 から取ってバンドルを書き、manifest と集計を返す。S3 は `get_bytes` だけを呼ぶ。"""
    photos_dir = out_dir / bundle.PHOTOS_DIR
    bundle.make_private_dir(out_dir)
    bundle.make_private_dir(photos_dir)
    # manifest を最後に書くので、書き直しの途中で止まったバンドルを完成したものと取り違えない。
    (out_dir / bundle.MANIFEST_FILE).unlink(missing_ok=True)

    stats = ExportStats()
    pins: list[dict[str, Any]] = []
    for pin_index, pin in enumerate(snapshot.pins):
        photos = []
        # 写真を消すと position に隙間ができる（追加は最大 + 1）。並び順はそのままに、
        # 読み込みが求める 0 からの連番に振り直す。
        for position, photo in enumerate(pin.photos):
            try:
                data = storage.get_bytes(photo.s3_key, max_bytes=max_bytes)
            except Exception as exc:  # noqa: BLE001 - 文言に S3 のキー（ユーザー ID が入る）が入る
                raise ExportError(
                    f"ピン {pin_index} の写真 {position}: {type(exc).__name__}"
                ) from None
            if len(data) != photo.byte_size:
                raise ExportError(
                    f"ピン {pin_index} の写真 {position}: 大きさが pin_photos.byte_size と違います"
                )
            bundle.write_private_bytes(out_dir / bundle.photo_file(photo.source_id), data)
            stats.max_photo_bytes = max(stats.max_photo_bytes, len(data))
            photos.append(
                {
                    "source_id": photo.source_id,
                    "file": bundle.photo_file(photo.source_id),
                    "position": position,
                    "taken_at": bundle.format_timestamp(photo.taken_at) if photo.taken_at else None,
                    "created_at": bundle.format_timestamp(photo.created_at),
                    "byte_size": len(data),
                    "width": photo.width,
                    "height": photo.height,
                    "sha256": bundle.sha256_hex(data),
                }
            )
        pins.append({**pin.record, "photos": photos})

    # 前の書き出しの後で地図から消えた写真・書きかけのファイルを消す。
    expected = {f"{photo.source_id}.jpg" for pin in snapshot.pins for photo in pin.photos}
    for path in photos_dir.iterdir():
        if path.name not in expected:
            path.unlink()
            stats.stale_files_removed += 1

    pins_bytes = bundle.encode_json({"pins": pins})
    bundle.write_private_bytes(out_dir / bundle.PINS_FILE, pins_bytes)
    manifest = bundle.build_manifest(
        source=source, pins=pins, pins_bytes=pins_bytes, exported_at=exported_at
    )
    bundle.write_private_bytes(out_dir / bundle.MANIFEST_FILE, bundle.encode_json(manifest))
    return manifest, stats


def run(
    *,
    target: str,
    sanpo_map_id: uuid.UUID,
    created_by: uuid.UUID | None,
    out_dir: Path,
    session_factory: Callable[[], Session],
    storage: ObjectStorage,
    max_bytes: int,
    now: Callable[[], datetime] = lambda: datetime.now(UTC),
) -> dict[str, Any]:
    """読んで書き、出力する報告を返す。"""
    snapshot = read_map(session_factory, sanpo_map_id, created_by=created_by)
    manifest, stats = export_bundle(
        snapshot,
        out_dir=out_dir,
        source={"kind": "sanposcape", "environment": target, "map_id": str(sanpo_map_id)},
        storage=storage,
        max_bytes=max_bytes,
        exported_at=now(),
    )
    report: dict[str, Any] = {
        "counts": manifest["counts"],
        "photo_bytes_total": manifest["photo_bytes_total"],
        "max_photo_bytes": stats.max_photo_bytes,
        "stale_files_removed": stats.stale_files_removed,
        "creator_pin_counts": snapshot.creator_pin_counts,
        "filtered_by_creator": created_by is not None,
    }
    if len(snapshot.creator_pin_counts) >= 2 and created_by is None:
        report["warning"] = (
            "地図に複数のユーザーのピンがあります。すべて読み込みで指定するユーザーのものに"
            "なります（--created-by で絞れます）"
        )
    return report


# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------


def default_out_dir(target: str, sanpo_map_id: uuid.UUID) -> Path:
    return bundle.WORK_DIR / f"bundle-{target}-{sanpo_map_id}"


def describe_error(exc: BaseException) -> str:
    if isinstance(exc, ExportError):
        return str(exc)
    return ib.describe_error(exc)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="環境の地図を移行バンドルに書き出す")
    parser.add_argument("--target", choices=TARGETS, required=True)
    parser.add_argument("--map-id", type=uuid.UUID, required=True)
    parser.add_argument(
        "--out", type=Path, help="既定は tmp/walkshare-migration/bundle-<target>-<地図 ID>"
    )
    parser.add_argument(
        "--created-by", type=uuid.UUID, help="このユーザーが作ったピンだけを書き出す"
    )
    parser.add_argument("--aws-account-id", help="dev で、資格情報のアカウントと照合する")
    parser.add_argument("--db-host", help="dev で、DATABASE_DSN のホスト名と照合する")
    args = parser.parse_args(argv)
    # sanposcape のロガーの WARNING には S3 のキー（ユーザー ID が入る）などが出うる。
    logging.getLogger("sanposcape").setLevel(logging.ERROR)

    try:
        out_dir = bundle.require_inside_work_dir(
            args.out or default_out_dir(args.target, args.map_id)
        )
        settings = ib.prepare_target(
            args.target, aws_account_id=args.aws_account_id, db_host=args.db_host
        )
        storage, storage_name = ib.build_storage(args.target, settings)
        engine = create_read_only_engine(settings.database_url, settings.sqlalchemy_engine_kwargs)
        report = run(
            target=args.target,
            sanpo_map_id=args.map_id,
            created_by=args.created_by,
            out_dir=out_dir,
            session_factory=sessionmaker(bind=engine),
            storage=storage,
            max_bytes=settings.pin_photo_max_bytes,
        )
    except Exception as exc:  # noqa: BLE001 - 文言・トレースバックに個人のデータが入りうる
        print(f"error: {describe_error(exc)}", file=sys.stderr)
        return 1
    print(
        json.dumps(
            {
                "target": args.target,
                "db_host": make_url(settings.database_url).host or "",
                "storage": storage_name,
                **report,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
