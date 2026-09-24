"""Pillow によるサムネイル生成（純粋関数、DB/S3 に依存しない）。

`bytes -> ThumbnailResult` のみを扱う。確定処理（`photo_attacher.py`）から呼ばれ、
デコードできることの検証（マジックバイト検査より強い、B-D7）を兼ねる。

寸法の扱い: `original_width`/`original_height` は画像ファイルのヘッダーから得た値
（EXIF の回転補正を適用する前）。mobile が端末で EXIF を除去してからアップロードする
前提（B-Y6）のため通常は補正の要否自体が発生しないが、万一 EXIF 付きの画像が来ても
サムネイル自体は `ImageOps.exif_transpose` で正しい向きに補正して生成する。
"""

import io
from dataclasses import dataclass

from PIL import Image, ImageOps
from PIL import UnidentifiedImageError as PillowUnidentifiedImageError


class InvalidImageError(Exception):
    """デコード不可・JPEG 以外・画素数超過など、サムネイルを生成できない入力。"""


@dataclass(frozen=True)
class ThumbnailResult:
    original_width: int
    original_height: int
    jpeg_bytes: bytes
    width: int
    height: int


def make_thumbnail(data: bytes, *, max_edge: int, quality: int, max_pixels: int) -> ThumbnailResult:
    """原本のバイト列からサムネイル（長辺 `max_edge` px, JPEG, `quality`）を生成する。

    - JPEG 以外（`image.format != "JPEG"`）は `InvalidImageError`。
    - ヘッダーから読める画素数（幅 × 高さ）が `max_pixels` を超える場合
      （decompression bomb 対策）は、ピクセルデータを読む前に `InvalidImageError`。
    - `image.draft()` で JPEG の DCT 縮小デコードを使い、メモリと CPU を抑える
      （最終的な縮小先の2倍角を目標にし、最終リサイズの元絵として十分な解像度を残す）。
    - `image.thumbnail()` は縮小のみ行い拡大はしない（Pillow の仕様どおり）。
    - 出力 JPEG に EXIF は含めない（`save()` に `exif=` を渡さない）。
    """
    try:
        image = Image.open(io.BytesIO(data))
        image_format = image.format
    except (OSError, PillowUnidentifiedImageError, ValueError, Image.DecompressionBombError) as exc:
        # `Image.open()` はヘッダーだけから寸法を読み取り、`Image.MAX_IMAGE_PIXELS` の
        # 2倍を超える寸法を宣言していれば `DecompressionBombError` を直接送出する
        # （ピクセルデータ自体は小さくてもよく、寸法欄だけ改ざんした小さいファイルでも
        # 再現できる。PR #93 T6: `DecompressionBombError` は `Exception` の直接の
        # サブクラスで `OSError`/`ValueError` に該当しないため、以前はここで捕まらず
        # 409 ではなく 500 になっていた）。
        raise InvalidImageError("Cannot decode image") from exc

    if image_format != "JPEG":
        raise InvalidImageError(f"Unsupported image format: {image_format!r}")

    original_width, original_height = image.size
    if original_width <= 0 or original_height <= 0:
        raise InvalidImageError("Image has non-positive dimensions")
    if original_width * original_height > max_pixels:
        raise InvalidImageError("Image pixel count exceeds the limit")

    try:
        image.draft("RGB", (max_edge * 2, max_edge * 2))
        image.load()
        image = ImageOps.exif_transpose(image)
        if image.mode != "RGB":
            image = image.convert("RGB")
        image.thumbnail((max_edge, max_edge), Image.LANCZOS)
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=quality, optimize=True)
    except (OSError, ValueError, Image.DecompressionBombError) as exc:
        raise InvalidImageError("Failed to process image") from exc

    return ThumbnailResult(
        original_width=original_width,
        original_height=original_height,
        jpeg_bytes=buffer.getvalue(),
        width=image.width,
        height=image.height,
    )
