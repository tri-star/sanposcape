"""移行バンドルの形（format_version 1）と、置き場所・書き込みの約束（README「バンドルの形」）。

書き出し（`export_walkshare.py` など）と読み込みで共有し、ファイルの名前・日時の書き方・
sha256 の取り方を1か所にする。

★ 標準ライブラリだけで書く（Google のライブラリだけを足してホストで動かす書き出しからも
import する）。
"""

import hashlib
import json
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

FORMAT_VERSION = 1

MANIFEST_FILE = "manifest.json"
PINS_FILE = "pins.json"
PHOTOS_DIR = "photos"

#: ダンプ・バンドル・対応表を置くディレクトリ（git の外。README「個人のデータの扱い」）。
#: リポジトリのルートは packages/backend の2つ上。コンテナ（packages/backend だけを
#: /app にマウントする）の中には無いので、スクリプトはホストで動かす（README の手順）。
WORK_DIR = Path(__file__).resolve().parents[2].parent.parent / "tmp" / "walkshare-migration"

# 写真の source_id はファイル名に入るので、パスの区切りや `..` を作れない文字だけを許す。
_SOURCE_ID_PATTERN = re.compile(r"[A-Za-z0-9_-]{1,128}")


class BundleError(Exception):
    """バンドルの置き場所・形の誤り。文言には個人のデータを入れない。"""


def require_inside_work_dir(path: Path, *, work_dir: Path | None = None) -> Path:
    """`path` を解決し、`work_dir`（既定は `WORK_DIR`）の中（自身は除く）でなければ
    `BundleError`。
    """
    work_dir = WORK_DIR if work_dir is None else work_dir
    resolved = path.resolve()
    if work_dir.resolve() not in resolved.parents:
        raise BundleError(f"置き場所は {work_dir} の中にしてください")
    return resolved


def is_valid_source_id(source_id: object) -> bool:
    return isinstance(source_id, str) and _SOURCE_ID_PATTERN.fullmatch(source_id) is not None


def photo_file(source_id: str) -> str:
    """写真のバンドルの中のパス（pins.json の `file`）。"""
    if not is_valid_source_id(source_id):
        raise BundleError("写真の source_id にファイル名に使えない文字があります")
    return f"{PHOTOS_DIR}/{source_id}.jpg"


def format_timestamp(value: datetime) -> str:
    """UTC の ISO 8601（`2022-03-09T01:23:45.000000Z`）。naive な値は受け付けない。"""
    if value.tzinfo is None:
        raise ValueError("naive datetime")
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def parse_timestamp(value: str) -> datetime:
    """`format_timestamp` の逆。タイムゾーンの無い値は `ValueError`。"""
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise ValueError("timestamp without timezone")
    return parsed.astimezone(UTC)


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def make_private_dir(path: Path) -> None:
    """ディレクトリを 0700 で作る（既にあれば権限だけ直す）。足りない親も 0700 で作る。

    `mkdir(parents=True)` は親を既定の権限で作るので、1つずつ作る。`path` 自身が symlink なら
    辿らずに拒む（chmod が symlink の先を変えるため）。途中の symlink は見ないので、
    呼び出し元が `require_inside_work_dir`（resolve 済み）を通したパスを渡す。
    """
    missing = []
    current = path
    while not current.exists() and not current.is_symlink():
        missing.append(current)
        current = current.parent
    for directory in reversed(missing):
        directory.mkdir(mode=0o700)
    if path.is_symlink() or not path.is_dir():
        raise BundleError("置き場所がディレクトリではありません（symlink は使えません）")
    path.chmod(0o700)


def write_private_bytes(path: Path, data: bytes) -> None:
    """0600 のファイルに書く。途中で止まっても `path` に書きかけが残らないよう、
    別名に書いて置き換える。
    """
    partial = path.with_name(f".{path.name}.partial")
    # 書きかけの名前に symlink が置かれていても、その先を書き換えない。
    fd = os.open(partial, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    # 既にあった書きかけ（O_CREAT の mode は効かない）も 0600 にする。
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    partial.replace(path)


def encode_json(content: Any) -> bytes:
    return (json.dumps(content, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def build_manifest(
    *, source: dict[str, Any], pins: list[dict[str, Any]], pins_bytes: bytes, exported_at: datetime
) -> dict[str, Any]:
    photos = [photo for pin in pins for photo in pin["photos"]]
    return {
        "format_version": FORMAT_VERSION,
        "source": source,
        "exported_at": format_timestamp(exported_at),
        "counts": {
            "pins": len(pins),
            "photos": len(photos),
            "tags": sum(len(pin["tags"]) for pin in pins),
        },
        "photo_bytes_total": sum(photo["byte_size"] for photo in photos),
        "pins_sha256": sha256_hex(pins_bytes),
    }
