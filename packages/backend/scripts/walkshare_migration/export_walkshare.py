"""walkshare のダンプと GCS の原本から、移行バンドルを書き出す（SS-238。
README「walkshare の書き出し」）。

- 範囲: 本人のアカウント（config の `owner_uid`）が作ったスポットと、作成者の記録が無いスポット。
- 写真: GCS から1枚ずつメモリに取り、EXIF の向きを画素に反映 → 長辺 2048px（LANCZOS）→
  JPEG 品質 70。Exif は付けず、RGB の原本の ICC プロファイルだけを引き継ぐ。
  原本はファイルに書かない。
- 再開: 書いた写真ごとに `<bundle>/.progress.jsonl` に sha256 などを追記する。再実行では、
  ファイルの sha256 が記録と合う写真を GCS から取り直さない。`pins.json`・`manifest.json` は
  最後に書く（manifest があれば完成）。

ダンプの形は `dump_walkshare.py`、使い方は README「walkshare の書き出しの手順」。
出力は件数・容量・ICC の種類の内訳だけ（README「スクリプトの出力」）。
"""

import argparse
import io
import json
import os
import sys
from collections import Counter
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import bundle
from PIL import Image, ImageCms, ImageOps

from sanposcape.sanpo_maps.pins.tag_labels import dedupe_tags

DEFAULT_DUMP_DIR = bundle.WORK_DIR / "dump"
DEFAULT_BUNDLE_DIR = bundle.WORK_DIR / "bundle-walkshare"
DEFAULT_CONFIG = bundle.WORK_DIR / "config.json"
PROGRESS_FILE = ".progress.jsonl"

# mobile の再圧縮（長辺 2048px・品質 0.7）に合わせる。
MAX_EDGE_PX = 2048
JPEG_QUALITY = 70

# API の契約（pins/schemas.py）。超えたら切り詰めずに止める。
PIN_NAME_MAX_LENGTH = 50
PIN_MEMO_MAX_LENGTH = 1000
PIN_TAG_MAX_COUNT = 10

#: 写真の原本を取る関数（Storage のパス → バイト列）。テストでは差し替える。
FetchPhoto = Callable[[str], bytes]


class ExportError(Exception):
    """バンドルを作れない。文言には個人のデータを入れず、バンドルの中の連番だけで場所を示す。"""


# ---------------------------------------------------------------------------
# ダンプ → ピン（範囲の絞り込み・マッピング）
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PhotoPlan:
    """バンドルに入れる写真1枚（処理の前）。"""

    source_id: str
    storage_path: str
    taken_at: datetime | None
    created_at: datetime


@dataclass(frozen=True)
class PinPlan:
    """バンドルに入れるピン1件（写真の処理の前）。"""

    record: dict[str, Any]  # pins.json の1件から photos を除いたもの
    photos: list[PhotoPlan]


def load_dump(dump_dir: Path) -> dict[str, Any]:
    dump = {}
    for name in ("manifest", "map", "spots", "photos", "names"):
        dump[name] = json.loads((dump_dir / f"{name}.json").read_text(encoding="utf-8"))
    return dump


def is_in_scope(spot: Mapping[str, Any], owner_uid: str) -> bool:
    """本人のアカウントが作ったスポットと、作成者の記録が無いスポット（README「移す範囲」）。"""
    uid = spot["data"].get("uid")
    return uid is None or uid == f"users/{owner_uid}"


def plan_pins(dump: Mapping[str, Any], owner_uid: str) -> list[PinPlan]:
    """ダンプから、移す範囲のスポットをピンに写す。作成日時・ID の順に並べる。"""
    photos_prefix = f"{dump['map']['path']}/photos/"
    photos_by_path = {photo["path"]: photo for photo in dump["photos"]}
    names_by_path = {name["path"]: name for name in dump["names"]}

    spots = [spot for spot in dump["spots"] if is_in_scope(spot, owner_uid)]
    spots.sort(key=lambda spot: (_required_timestamp(spot["data"], "date"), spot["id"]))

    plans: list[PinPlan] = []
    seen_photos: set[str] = set()
    for index, spot in enumerate(spots):
        try:
            plan = _plan_pin(spot, photos_prefix, photos_by_path, names_by_path)
        except (KeyError, TypeError, ValueError) as exc:
            raise ExportError(f"ピン {index} を写せません: {type(exc).__name__}") from None
        except ExportError as exc:
            raise ExportError(f"ピン {index}: {exc}") from None
        for photo in plan.photos:
            if photo.source_id in seen_photos:
                raise ExportError(f"ピン {index}: 同じ写真が複数のピンにあります")
            seen_photos.add(photo.source_id)
        plans.append(plan)
    return plans


def _plan_pin(
    spot: Mapping[str, Any],
    photos_prefix: str,
    photos_by_path: Mapping[str, Mapping[str, Any]],
    names_by_path: Mapping[str, Mapping[str, Any]],
) -> PinPlan:
    data = spot["data"]
    if not bundle.is_valid_source_id(spot["id"]):
        raise ExportError("スポットの ID に想定外の文字があります")
    created_at = _required_timestamp(data, "date")
    last_visited = _optional_timestamp(data, "last_visited")
    # `last_visited < date` のスポットがあるので max を取る。
    # 写真の日時は入れない（ADR-009 決定23）。
    updated_at = max(created_at, last_visited) if last_visited else created_at

    point = data["point"]
    latitude, longitude = float(point["latitude"]), float(point["longitude"])
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise ExportError("位置が範囲の外です")

    photos: list[PhotoPlan] = []
    tag_labels: list[str] = []
    for ref in data.get("photos") or []:
        if not isinstance(ref, str) or not ref.startswith(photos_prefix):
            raise ExportError("写真の参照が想定の形（この地図の photos への参照）ではありません")
        photo = photos_by_path.get(ref)
        if photo is None:
            raise ExportError("参照先の写真がダンプにありません")
        if not bundle.is_valid_source_id(photo["id"]):
            raise ExportError("写真の ID に想定外の文字があります")
        taken_at = _optional_timestamp(photo["data"], "date")
        photos.append(
            PhotoPlan(
                source_id=photo["id"],
                storage_path=photo["storage_path"],
                taken_at=taken_at,
                # 再訪で足した写真は、撮影がスポットの作成より後になる。
                created_at=max(created_at, taken_at) if taken_at else created_at,
            )
        )
        name_ref = photo["data"].get("name")
        if name_ref is not None:
            name = names_by_path.get(name_ref)
            if name is None or not isinstance(name["data"].get("name"), str):
                raise ExportError("写真の名前の参照先がダンプにありません")
            tag_labels.append(name["data"]["name"])

    # ピンの写真の順に集め、
    # tag_labels で正規化・重複除去する（読み込みはこの結果と一致しなければ止める）。
    labels = dedupe_tags(tag_labels)
    if len(labels) > PIN_TAG_MAX_COUNT:
        raise ExportError("タグが多すぎます")

    record = {
        "source_id": spot["id"],
        "name": _trimmed_or_none(data.get("title"), PIN_NAME_MAX_LENGTH, "名前"),
        "memo": _trimmed_or_none(data.get("comment"), PIN_MEMO_MAX_LENGTH, "メモ"),
        "latitude": latitude,
        "longitude": longitude,
        "visited": True,
        "archived": False,
        "created_at": bundle.format_timestamp(created_at),
        "updated_at": bundle.format_timestamp(updated_at),
        # 並びは読み込みが created_at を繰り上げて配列の順にする（README「pins.json」）。
        "tags": [
            {"label": label, "created_at": bundle.format_timestamp(created_at)} for label in labels
        ],
    }
    return PinPlan(record=record, photos=photos)


def _required_timestamp(data: Mapping[str, Any], key: str) -> datetime:
    value = data.get(key)
    if not isinstance(value, str):
        raise ExportError(f"{key} がありません")
    return bundle.parse_timestamp(value)


def _optional_timestamp(data: Mapping[str, Any], key: str) -> datetime | None:
    value = data.get(key)
    return bundle.parse_timestamp(value) if isinstance(value, str) else None


def _trimmed_or_none(value: Any, max_length: int, label: str) -> str | None:
    """前後の空白を除き、空なら None（API の PinCreate と同じ）。長すぎれば止める。"""
    if value is None:
        return None
    if not isinstance(value, str):
        raise ExportError(f"{label}が文字列ではありません")
    trimmed = value.strip()
    if len(trimmed) > max_length:
        raise ExportError(f"{label}が {max_length} 文字を超えています")
    return trimmed or None


# ---------------------------------------------------------------------------
# 写真の再圧縮
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProcessedPhoto:
    jpeg: bytes
    width: int
    height: int
    icc: str  # ICC の種類（プロファイルの説明。無ければ "none"）。集計に使う


def recompress(original: bytes) -> ProcessedPhoto:
    """EXIF の向きを画素に反映し、長辺 `MAX_EDGE_PX` の JPEG（品質 `JPEG_QUALITY`）にする。"""
    with Image.open(io.BytesIO(original)) as source:
        if source.format != "JPEG":
            raise ExportError("原本が JPEG ではありません")
        # ICC は色の情報なので引き継ぐ。
        # RGB 以外（CMYK・グレー）の ICC は convert("RGB") の後の色空間と合わない。
        icc_profile = source.info.get("icc_profile") if source.mode == "RGB" else None
        image = ImageOps.exif_transpose(source)
    if image.mode != "RGB":
        image = image.convert("RGB")
    image.thumbnail((MAX_EDGE_PX, MAX_EDGE_PX), Image.Resampling.LANCZOS)
    # 原本の info（exif・icc_profile など）が保存に混ざらないよう、渡すものは明示する。
    image.info.clear()
    out = io.BytesIO()
    if icc_profile:
        image.save(out, format="JPEG", quality=JPEG_QUALITY, icc_profile=icc_profile)
    else:
        image.save(out, format="JPEG", quality=JPEG_QUALITY)
    return ProcessedPhoto(
        jpeg=out.getvalue(),
        width=image.width,
        height=image.height,
        icc=_describe_icc(icc_profile),
    )


def _describe_icc(icc_profile: bytes | None) -> str:
    if not icc_profile:
        return "none"
    try:
        profile = ImageCms.ImageCmsProfile(io.BytesIO(icc_profile))
        return ImageCms.getProfileDescription(profile).strip() or "(no description)"
    except (ImageCms.PyCMSError, OSError):
        return "(unreadable)"


# ---------------------------------------------------------------------------
# バンドルの書き出し
# ---------------------------------------------------------------------------


@dataclass
class ExportStats:
    photos_fetched: int = 0
    photos_reused: int = 0
    stale_files_removed: int = 0
    max_photo_bytes: int = 0
    icc: Counter[str] = field(default_factory=Counter)


def export_bundle(
    plans: list[PinPlan],
    *,
    out_dir: Path,
    source: dict[str, Any],
    fetch_photo: FetchPhoto,
    exported_at: datetime,
) -> tuple[dict[str, Any], ExportStats]:
    """`plans` の写真を処理してバンドルを書き、manifest と集計を返す。"""
    photos_dir = out_dir / bundle.PHOTOS_DIR
    bundle.make_private_dir(out_dir)
    bundle.make_private_dir(photos_dir)
    # manifest を最後に書くので、書き直しの途中で止まったバンドルを完成したものと取り違えない。
    (out_dir / bundle.MANIFEST_FILE).unlink(missing_ok=True)

    progress_path = out_dir / PROGRESS_FILE
    progress = _load_progress(progress_path)
    stats = ExportStats()
    pins: list[dict[str, Any]] = []
    fd = os.open(progress_path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    with os.fdopen(fd, "a", encoding="utf-8") as progress_log:
        if _ends_without_newline(progress_path):
            # 前回が行の途中で止まった。続けて書くと次の行まで読めなくなるので、行を閉じる。
            progress_log.write("\n")
        for pin_index, plan in enumerate(plans):
            photos = []
            for position, photo in enumerate(plan.photos):
                try:
                    entry = _export_photo(
                        photo, out_dir, progress, progress_log, fetch_photo, stats
                    )
                except ExportError as exc:
                    raise ExportError(f"ピン {pin_index} の写真 {position}: {exc}") from None
                except Exception as exc:  # noqa: BLE001 - 文言に Storage のパス（旧アプリの ID）が入りうる
                    raise ExportError(
                        f"ピン {pin_index} の写真 {position}: {type(exc).__name__}"
                    ) from None
                photos.append(
                    {
                        "source_id": photo.source_id,
                        "file": bundle.photo_file(photo.source_id),
                        "position": position,
                        "taken_at": bundle.format_timestamp(photo.taken_at)
                        if photo.taken_at
                        else None,
                        "created_at": bundle.format_timestamp(photo.created_at),
                        **entry,
                    }
                )
                stats.max_photo_bytes = max(stats.max_photo_bytes, entry["byte_size"])
            pins.append({**plan.record, "photos": photos})

    # 前の書き出しの後でダンプから外れた写真・書きかけのファイルを消す。
    expected = {f"{photo.source_id}.jpg" for plan in plans for photo in plan.photos}
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


def _ends_without_newline(path: Path) -> bool:
    with path.open("rb") as f:
        if f.seek(0, os.SEEK_END) == 0:
            return False
        f.seek(-1, os.SEEK_END)
        return f.read(1) != b"\n"


def _load_progress(path: Path) -> dict[str, dict[str, Any]]:
    """記録を読む。後の行が勝つ。最後の行が書きかけ（途中で止まった）なら捨てる。"""
    progress: dict[str, dict[str, Any]] = {}
    if not path.exists():
        return progress
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        progress[entry["source_id"]] = entry
    return progress


def _export_photo(
    photo: PhotoPlan,
    out_dir: Path,
    progress: dict[str, dict[str, Any]],
    progress_log: io.TextIOBase,
    fetch_photo: FetchPhoto,
    stats: ExportStats,
) -> dict[str, Any]:
    """写真1枚を書き（記録と sha256 が合えば書き直さない）、
    pins.json の大きさ・sha256 の項目を返す。
    """
    path = out_dir / bundle.photo_file(photo.source_id)
    recorded = progress.get(photo.source_id)
    if (
        recorded is not None
        and path.exists()
        and bundle.sha256_hex(path.read_bytes()) == recorded["sha256"]
    ):
        stats.photos_reused += 1
        stats.icc[recorded["icc"]] += 1
        return {key: recorded[key] for key in ("byte_size", "width", "height", "sha256")}

    processed = recompress(fetch_photo(photo.storage_path))
    entry = {
        "byte_size": len(processed.jpeg),
        "width": processed.width,
        "height": processed.height,
        "sha256": bundle.sha256_hex(processed.jpeg),
    }
    bundle.write_private_bytes(path, processed.jpeg)
    record = {"source_id": photo.source_id, "icc": processed.icc, **entry}
    progress_log.write(json.dumps(record) + "\n")
    progress_log.flush()
    progress[photo.source_id] = record
    stats.photos_fetched += 1
    stats.icc[processed.icc] += 1
    return entry


# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------


def gcs_fetcher(project: str, bucket_name: str) -> FetchPhoto:
    """GCS から原本をメモリに取る（ここだけが実際の GCS に繋ぐ。ADC で認証する）。"""
    from google.cloud import storage

    bucket = storage.Client(project=project).bucket(bucket_name)
    return lambda path: bucket.blob(path).download_as_bytes()


def run(config_path: Path, dump_dir: Path, out: Path) -> dict[str, Any]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    out_dir = bundle.require_inside_work_dir(out)
    dump = load_dump(bundle.require_inside_work_dir(dump_dir))
    plans = plan_pins(dump, config["owner_uid"])
    manifest, stats = export_bundle(
        plans,
        out_dir=out_dir,
        source={"kind": "walkshare", "map_id": dump["manifest"]["map_id"]},
        fetch_photo=gcs_fetcher(config["firebase_project"], config["bucket"]),
        exported_at=datetime.now(UTC),
    )
    return {
        "counts": manifest["counts"],
        "pins_without_photos": sum(1 for plan in plans if not plan.photos),
        "pins_with_tags": sum(1 for plan in plans if plan.record["tags"]),
        "max_tags_per_pin": max((len(plan.record["tags"]) for plan in plans), default=0),
        "photos_without_taken_at": sum(
            1 for plan in plans for photo in plan.photos if photo.taken_at is None
        ),
        "photo_bytes_total": manifest["photo_bytes_total"],
        "max_photo_bytes": stats.max_photo_bytes,
        "photos_fetched": stats.photos_fetched,
        "photos_reused": stats.photos_reused,
        "stale_files_removed": stats.stale_files_removed,
        "icc": dict(stats.icc.most_common()),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="walkshare のダンプと GCS から移行バンドルを書き出す"
    )
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--dump", type=Path, default=DEFAULT_DUMP_DIR)
    parser.add_argument("--out", type=Path, default=DEFAULT_BUNDLE_DIR)
    args = parser.parse_args(argv)
    try:
        summary = run(args.config, args.dump, args.out)
    except (ExportError, bundle.BundleError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 - 文言・トレースバックに個人のデータが入りうるので型だけを出す
        print(f"error: {type(exc).__name__}", file=sys.stderr)
        return 1
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
