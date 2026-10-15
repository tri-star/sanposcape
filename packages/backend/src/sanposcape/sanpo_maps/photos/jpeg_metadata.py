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

構造を辿れない入力（SOI が無い・セグメント長が壊れている・EOI が無い）は
`InvalidImageError`。メタデータを残したまま保存するより安全側に倒す。
"""

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

    while True:
        marker, segment_start, pos = _read_marker(data, pos)
        if marker == _EOI:
            kept.append(data[segment_start:pos])
            break
        if marker in _STANDALONE_MARKERS:
            kept.append(data[segment_start:pos])
            continue

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
    length = len(data)
    if pos >= length or data[pos] != 0xFF:
        raise InvalidImageError("Expected a JPEG marker")
    start = pos
    # マーカーの前の詰め物（0xFF の連続）を読み飛ばす。
    while pos < length and data[pos] == 0xFF:
        pos += 1
    if pos >= length:
        raise InvalidImageError("JPEG ended without EOI")
    return data[pos], start, pos + 1


def _skip_entropy_coded_data(data: bytes, pos: int) -> int:
    """エントロピー符号化データを読み飛ばし、次のマーカー（RST 以外）の開始位置を返す。"""
    length = len(data)
    while True:
        marker_start = data.find(b"\xff", pos)
        if marker_start < 0:
            raise InvalidImageError("JPEG ended without EOI")
        # 0xFF の連続（詰め物）の後ろの1バイトでマーカーかどうかを判定する。
        pos = marker_start
        while pos < length and data[pos] == 0xFF:
            pos += 1
        if pos >= length:
            raise InvalidImageError("JPEG ended without EOI")
        following = data[pos]
        if following == 0x00 or 0xD0 <= following <= 0xD7:
            # バイトスタッフィング（0xFF00）か RST。スキャンの続き。
            pos += 1
            continue
        return marker_start


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
