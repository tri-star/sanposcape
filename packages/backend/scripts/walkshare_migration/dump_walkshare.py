"""walkshare（旧アプリ）の Firestore から、移す地図1件を JSON に書き出す（SS-238。
README「walkshare の書き出し」）。

読み取りだけを行う（書き込み・削除の API は呼ばない）。画像は取らず、Storage の原本の
パスだけを記録する。
書き出し（`export_walkshare.py`）が読む地図・spots・photos・names だけを取る。

使い方は README「walkshare の書き出しの手順」。出力（`tmp/walkshare-migration/dump/`）:

    manifest.json  いつ・どのプロジェクトの・どの地図から取ったか
    map.json       地図のドキュメント
    spots.json     spots の全件 `[{"id", "path", "data"}]`
    photos.json    photos の全件 `[{"id", "path", "data", "storage_path"}]`
    names.json     names の全件 `[{"id", "path", "data"}]`

値の変換: Timestamp → UTC の ISO 8601、GeoPoint → `{"latitude", "longitude"}`、
DocumentReference → パスの文字列（例: `users/<uid>`・`maps/<id>/photos/<id>`）。
それ以外の型は止める。
"""

import argparse
import json
import math
import sys
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import bundle

DUMP_FORMAT_VERSION = 1
DEFAULT_DUMP_DIR = bundle.WORK_DIR / "dump"
DEFAULT_CONFIG = bundle.WORK_DIR / "config.json"
SUBCOLLECTIONS = ("spots", "photos", "names")


class DumpError(Exception):
    """ダンプを作れない。文言には個人のデータを入れない。"""


def to_json_value(value: Any) -> Any:
    """Firestore の値を JSON にできる値へ変換する（Firestore に繋がずにテストできるよう、
    型はダックタイピングで見る）。
    """
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise DumpError("有限でない数値があります")
        return value
    if isinstance(value, datetime):
        # Firestore の Timestamp は datetime のサブクラス（DatetimeWithNanoseconds）で、UTC を持つ。
        return bundle.format_timestamp(value)
    if isinstance(value, Mapping):
        return {str(k): to_json_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_json_value(v) for v in value]
    # DocumentReference は `path`（"maps/x/photos/y"）と `id` を持つ。
    path, doc_id = getattr(value, "path", None), getattr(value, "id", None)
    if isinstance(path, str) and isinstance(doc_id, str):
        return path
    if hasattr(value, "latitude") and hasattr(value, "longitude"):
        return {"latitude": float(value.latitude), "longitude": float(value.longitude)}
    raise DumpError(f"変換できない型があります: {type(value).__name__}")


def storage_path_for(map_name: str, key: str, extension: str) -> str:
    """原本の Storage のパス `maps/{地図名}/{key}{extension}`。

    walkshare の photo_repository.dart と同じ。
    """
    return f"maps/{map_name}/{key}{extension}"


def build_dump(
    *,
    map_id: str,
    map_path: str,
    map_data: Mapping[str, Any],
    documents: Mapping[str, Iterable[tuple[str, str, Mapping[str, Any]]]],
) -> dict[str, Any]:
    """変換前のドキュメント群（サブコレクション名 → `(id, path, data)` の列）から、
    書き出す内容を作る。
    """
    map_record = {"id": map_id, "path": map_path, "data": to_json_value(map_data)}
    map_name = map_record["data"].get("name")
    if not isinstance(map_name, str) or not map_name:
        raise DumpError("地図の name がありません")

    records: dict[str, list[dict[str, Any]]] = {}
    for name in SUBCOLLECTIONS:
        records[name] = [
            {"id": doc_id, "path": path, "data": to_json_value(data)}
            for doc_id, path, data in sorted(documents[name], key=lambda d: d[0])
        ]
    for photo in records["photos"]:
        # photos の key はドキュメントの ID と同じ（walkshare の photo_repository.dart）。
        key = photo["data"].get("key", photo["id"])
        extension = photo["data"].get("extension")
        if key != photo["id"] or not isinstance(extension, str):
            raise DumpError("photos の key・extension が想定と違います")
        photo["storage_path"] = storage_path_for(map_name, key, extension)
    return {"map": map_record, **records}


def write_dump(out_dir: Path, dump: Mapping[str, Any], manifest: Mapping[str, Any]) -> None:
    bundle.make_private_dir(out_dir)
    for name in ("map", *SUBCOLLECTIONS):
        bundle.write_private_bytes(out_dir / f"{name}.json", bundle.encode_json(dump[name]))
    # manifest は最後に書く（あれば全部書き終えている）。
    bundle.write_private_bytes(out_dir / "manifest.json", bundle.encode_json(manifest))


def fetch_from_firestore(project: str, map_id: str) -> dict[str, Any]:
    """Firestore から読む（ここだけが実際の Firestore に繋ぐ。ADC で認証する）。"""
    from google.cloud import firestore

    client = firestore.Client(project=project)
    snapshot = client.collection("maps").document(map_id).get()
    if not snapshot.exists:
        raise DumpError("地図が見つかりません")
    documents = {
        name: [
            (doc.id, doc.reference.path, doc.to_dict() or {})
            for doc in snapshot.reference.collection(name).stream()
        ]
        for name in SUBCOLLECTIONS
    }
    return build_dump(
        map_id=snapshot.id,
        map_path=snapshot.reference.path,
        map_data=snapshot.to_dict() or {},
        documents=documents,
    )


def run(config_path: Path, out: Path, *, overwrite: bool) -> dict[str, Any]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    out_dir = bundle.require_inside_work_dir(out)
    if (out_dir / "manifest.json").exists() and not overwrite:
        raise DumpError(
            "出力先に既存のダンプがあります。上書きするなら --overwrite を付けてください"
        )

    dumped_at = datetime.now(UTC)
    dump = fetch_from_firestore(config["firebase_project"], config["map_id"])
    manifest = {
        "format_version": DUMP_FORMAT_VERSION,
        "dumped_at": bundle.format_timestamp(dumped_at),
        "project": config["firebase_project"],
        "map_id": dump["map"]["id"],
    }
    write_dump(out_dir, dump, manifest)
    return {name: len(dump[name]) for name in SUBCOLLECTIONS}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="walkshare の Firestore から地図1件をダンプする")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--out", type=Path, default=DEFAULT_DUMP_DIR)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args(argv)
    try:
        counts = run(args.config, args.out, overwrite=args.overwrite)
    except (DumpError, bundle.BundleError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 - 文言・トレースバックに個人のデータが入りうるので型だけを出す
        print(f"error: {type(exc).__name__}", file=sys.stderr)
        return 1
    print(json.dumps({"counts": counts}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
