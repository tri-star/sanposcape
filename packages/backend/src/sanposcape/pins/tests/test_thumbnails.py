import io

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
