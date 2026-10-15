"""JPEG のメタデータを無劣化で取り除く（純粋関数、DB/S3 に依存しない。ADR-009 BK-10, SS-116）。

ピン写真の原本を S3 の `original/` に置く前に、撮影位置（GPS）などを含みうるメタデータの
セグメントを取り除く。画像データ（量子化表・ハフマン表・フレーム・スキャンとエントロピー
符号化データ）はバイト列のまま写すので、画素は1ビットも変わらない（再エンコードしない）。

- 残す: APP0（JFIF・JFXX）、APP2 の `ICC_PROFILE`（色）、APP14 の `Adobe`（色変換の指定）、
  APPn・COM 以外の全セグメント。
- 落とす: APP1（Exif・XMP）、上記以外の APPn（APP13 の IPTC/Photoshop、APP2 の MPF など）、
  COM、EOI より後ろの付加データ（MPF の副画像は自前の EXIF を持ちうる）。
- 向き（Exif の Orientation）だけは、Orientation タグ1つの最小の Exif として書き戻す。
  落とすと、EXIF の向きを解釈する端末の表示と、`exif_transpose` 済みのサムネイルとで
  向きが食い違うため。

構造を辿れない入力（SOI が無い・セグメント長が壊れている・EOI が無い・途中に SOI がある・
セグメントが多すぎる）は `InvalidImageError`。メタデータを残したまま保存するより安全側に倒す。

計算量: 入力は利用者が直送した任意のバイト列（最大 `PIN_PHOTO_MAX_BYTES`）で、デコードの検証
（`make_thumbnail()`）より前に走る。Python のループはセグメント単位で `_MAX_SEGMENTS` までに抑え、
0xFF の連続とエントロピー符号化データの読み飛ばしは `re` に任せる（1バイトずつの Python ループに
すると、短いセグメントや 0xFF00 を詰めた 10 MiB で秒単位の CPU を使う。SS-116 レビュー）。
"""

import re

from PIL import Image

from sanposcape.sanpo_maps.photos.thumbnails import InvalidImageError

_SOI = 0xD8
_EOI = 0xD9
_SOS = 0xDA
_COM = 0xFE
_APP0 = 0xE0
_APP1 = 0xE1
_APP2 = 0xE2
_APP14 = 0xEE
_ORIENTATION_TAG = 0x0112
_EXIF_IDENTIFIER = b"Exif\x00\x00"

# 長さを持たない単独のマーカー（TEM・RST0〜7）。
_STANDALONE_MARKERS = frozenset([0x01, *range(0xD0, 0xD8)])

# セグメント（スキャンを1つと数える）の上限。カメラの JPEG は数十、progressive でも百に届かない。
# 分割した ICC プロファイル（APP2 は最大255個）を含めても足りる値にしてある。
_MAX_SEGMENTS = 1024

_FILL_BYTES = re.compile(rb"\xff+")
# エントロピー符号化データの中で、スキャンを終えるマーカー（0xFF の直後が 0x00＝スタッフィング・
# RST0〜7・0xFF＝詰め物 のいずれでもない）。各位置で1バイトしか見ないので線形時間。
_SCAN_END_MARKER = re.compile(rb"\xff[^\x00\xd0-\xd7\xff]")

# 残す APPn: (マーカー, ペイロードの先頭)。
_KEPT_APP_SEGMENTS = (
    (_APP0, b"JFIF\x00"),
    (_APP0, b"JFXX\x00"),
    (_APP2, b"ICC_PROFILE\x00"),
    (_APP14, b"Adobe"),
)


def strip_jpeg_metadata(data: bytes) -> bytes:
    """`data`（JPEG）からメタデータのセグメントを取り除いたバイト列を返す。

    取り除くものが無ければ `data` と同じ内容を返す（呼び出し元は等値比較で「変化なし」を
    判定できる）。
    """
    if len(data) < 4 or data[0] != 0xFF or data[1] != _SOI:
        raise InvalidImageError("Not a JPEG (missing SOI)")

    kept: list[bytes] = [data[0:2]]
    orientation: int | None = None
    # 最小の Exif を差し込む位置（`kept` の添字）。APP0 があればその直後、無ければ SOI の直後。
    exif_insert_at = 1
    pos = 2
    length = len(data)

    segment_count = 0
    while True:
        segment_count += 1
        if segment_count > _MAX_SEGMENTS:
            raise InvalidImageError("Too many JPEG segments")
        marker, segment_start, pos = _read_marker(data, pos)
        if marker == _EOI:
            kept.append(data[segment_start:pos])
            break
        if marker in _STANDALONE_MARKERS:
            kept.append(data[segment_start:pos])
            continue
        if marker == _SOI or marker == 0x00:
            # 途中の SOI（別の画像の連結）・マーカーでない 0xFF00 は構造が壊れている。
            raise InvalidImageError("Unexpected JPEG marker")

        if pos + 2 > length:
            raise InvalidImageError("Truncated JPEG segment header")
        segment_length = int.from_bytes(data[pos : pos + 2], "big")
        payload_start = pos + 2
        segment_end = pos + segment_length
        if segment_length < 2 or segment_end > length:
            raise InvalidImageError("Invalid JPEG segment length")
        payload = data[payload_start:segment_end]
        pos = segment_end

        if marker == _SOS:
            # スキャンのヘッダーに続くエントロピー符号化データは、次のマーカー
            # （RST とバイトスタッフィングの 0xFF00 を除く）の直前までをそのまま写す。
            pos = _skip_entropy_coded_data(data, pos)
            kept.append(data[segment_start:pos])
            continue

        if _APP0 <= marker <= 0xEF or marker == _COM:
            if marker == _APP1 and payload.startswith(_EXIF_IDENTIFIER) and orientation is None:
                orientation = _read_orientation(payload)
            if any(marker == m and payload.startswith(p) for m, p in _KEPT_APP_SEGMENTS):
                kept.append(data[segment_start:segment_end])
                if marker == _APP0 and len(kept) == 2:
                    exif_insert_at = 2
            continue

        kept.append(data[segment_start:segment_end])

    if orientation is not None and orientation != 1:
        kept.insert(exif_insert_at, _orientation_segment(orientation))

    return b"".join(kept)


def _read_marker(data: bytes, pos: int) -> tuple[int, int, int]:
    """`pos` から次のマーカーを読み、(マーカー, マーカーの開始位置, マーカー直後の位置) を返す。"""
    # マーカーの前の詰め物（0xFF の連続）を読み飛ばす。
    fill = _FILL_BYTES.match(data, pos)
    if fill is None:
        raise InvalidImageError("Expected a JPEG marker")
    pos = fill.end()
    if pos >= len(data):
        raise InvalidImageError("JPEG ended without EOI")
    return data[pos], fill.start(), pos + 1


def _skip_entropy_coded_data(data: bytes, pos: int) -> int:
    """エントロピー符号化データを読み飛ばし、スキャンを終えるマーカーの位置（0xFF）を返す。

    バイトスタッフィング（0xFF00）・RST・マーカー前の詰め物の 0xFF はスキャンの一部として写す。
    """
    found = _SCAN_END_MARKER.search(data, pos)
    if found is None:
        raise InvalidImageError("JPEG ended without EOI")
    return found.start()


def _read_orientation(payload: bytes) -> int | None:
    """APP1 の Exif ペイロードから Orientation（1〜8）を読む。読めなければ None。"""
    try:
        exif = Image.Exif()
        exif.load(payload)
        value = exif.get(_ORIENTATION_TAG)
    except Exception:  # noqa: BLE001 - 壊れた Exif は向きの情報が無いものとして扱う
        return None
    if isinstance(value, int) and 1 <= value <= 8:
        return value
    return None


def _orientation_segment(orientation: int) -> bytes:
    """Orientation タグ1つだけを持つ APP1（Exif）のセグメントを作る。"""
    exif = Image.Exif()
    exif[_ORIENTATION_TAG] = orientation
    payload = exif.tobytes()
    return bytes([0xFF, _APP1]) + (len(payload) + 2).to_bytes(2, "big") + payload
