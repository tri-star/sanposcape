import io
import struct

import pytest
from PIL import Image

from sanposcape.pins.thumbnails import InvalidImageError, make_thumbnail


def _jpeg_bytes(
    size: tuple[int, int], *, color: str = "red", orientation: int | None = None
) -> bytes:
    image = Image.new("RGB", size, color=color)
    buffer = io.BytesIO()
    if orientation is not None:
        exif = image.getexif()
        exif[0x0112] = orientation  # Orientation タグ
        image.save(buffer, format="JPEG", exif=exif)
    else:
        image.save(buffer, format="JPEG")
    return buffer.getvalue()


class TestMakeThumbnail:
    def test_horizontal_image_is_scaled_down_preserving_aspect(self) -> None:
        result = make_thumbnail(
            _jpeg_bytes((200, 100)), max_edge=50, quality=80, max_pixels=1_000_000
        )
        assert result.original_width == 200
        assert result.original_height == 100
        assert result.width == 50
        assert result.height == 25

    def test_vertical_image_is_scaled_down_preserving_aspect(self) -> None:
        result = make_thumbnail(
            _jpeg_bytes((100, 200)), max_edge=50, quality=80, max_pixels=1_000_000
        )
        assert result.width == 25
        assert result.height == 50

    def test_small_image_is_not_enlarged(self) -> None:
        result = make_thumbnail(
            _jpeg_bytes((30, 20)), max_edge=512, quality=80, max_pixels=1_000_000
        )
        assert result.width == 30
        assert result.height == 20

    def test_exif_orientation_is_applied_to_the_thumbnail(self) -> None:
        # orientation=6 (要 90度回転) の 50x100(横長)画像は、回転補正後は縦長(100x50)になる。
        result = make_thumbnail(
            _jpeg_bytes((100, 50), orientation=6), max_edge=40, quality=80, max_pixels=1_000_000
        )
        assert result.width == 20
        assert result.height == 40

    def test_output_has_no_exif(self) -> None:
        result = make_thumbnail(
            _jpeg_bytes((100, 50), orientation=6), max_edge=40, quality=80, max_pixels=1_000_000
        )
        reopened = Image.open(io.BytesIO(result.jpeg_bytes))
        assert dict(reopened.getexif()) == {}

    def test_output_is_jpeg(self) -> None:
        result = make_thumbnail(
            _jpeg_bytes((100, 100)), max_edge=50, quality=80, max_pixels=1_000_000
        )
        reopened = Image.open(io.BytesIO(result.jpeg_bytes))
        assert reopened.format == "JPEG"

    def test_non_jpeg_raises_invalid_image_error(self) -> None:
        image = Image.new("RGB", (10, 10), color="blue")
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")

        with pytest.raises(InvalidImageError, match="Unsupported image format"):
            make_thumbnail(buffer.getvalue(), max_edge=50, quality=80, max_pixels=1_000_000)

    def test_pixel_count_over_limit_raises_invalid_image_error(self) -> None:
        with pytest.raises(InvalidImageError, match="pixel count exceeds"):
            make_thumbnail(_jpeg_bytes((200, 200)), max_edge=50, quality=80, max_pixels=100)

    def test_corrupted_bytes_raise_invalid_image_error(self) -> None:
        with pytest.raises(InvalidImageError, match="Cannot decode image"):
            make_thumbnail(b"not an image", max_edge=50, quality=80, max_pixels=1_000_000)

    def test_truncated_jpeg_raises_invalid_image_error(self) -> None:
        truncated = _jpeg_bytes((200, 200))[:100]
        with pytest.raises(InvalidImageError):
            make_thumbnail(truncated, max_edge=50, quality=80, max_pixels=1_000_000)

    def test_decompression_bomb_header_raises_invalid_image_error(self) -> None:
        """PR #93 T6 回帰テスト: `Image.open()` 自体が `Image.DecompressionBombError` を
        投げる場合（ヘッダーの寸法だけを Pillow の `MAX_IMAGE_PIXELS` の2倍超に改ざんした
        小さいファイル。ピクセルデータ自体は小さいままでよい）でも 500 にならず
        `InvalidImageError` になる。`DecompressionBombError` は `Exception` の直接の
        サブクラスで `OSError`/`ValueError` に該当しないため、以前はここで捕まらなかった。
        """
        data = bytearray(_jpeg_bytes((16, 16)))
        sof0_marker = data.find(b"\xff\xc0")
        assert sof0_marker != -1, "test JPEG is expected to use a baseline SOF0 marker"
        # SOF0: FF C0, length(2), precision(1), height(2), width(2), ...
        huge_dimension = 65_500  # Image.MAX_IMAGE_PIXELS(既定 ~89M) の2倍を大きく超える。
        height_offset = sof0_marker + 5
        width_offset = sof0_marker + 7
        data[height_offset : height_offset + 2] = struct.pack(">H", huge_dimension)
        data[width_offset : width_offset + 2] = struct.pack(">H", huge_dimension)

        # max_pixels は極端に緩くし、この InvalidImageError が「独自の画素数上限
        # チェック」ではなく `Image.open()` 自体の DecompressionBombError 由来である
        # ことを明確にする。
        with pytest.raises(InvalidImageError, match="Cannot decode image"):
            make_thumbnail(bytes(data), max_edge=50, quality=80, max_pixels=10**13)
