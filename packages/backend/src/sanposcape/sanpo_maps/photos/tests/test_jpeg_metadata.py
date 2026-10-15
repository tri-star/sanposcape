import io

import pytest
from PIL import ExifTags, Image, ImageOps

from sanposcape.sanpo_maps.conftest import make_jpeg_bytes
from sanposcape.sanpo_maps.photos.jpeg_metadata import strip_jpeg_metadata
from sanposcape.sanpo_maps.photos.thumbnails import InvalidImageError, make_thumbnail

GPS_MARKER = b"GPS-SECRET-35.6812N"


def make_image(size: tuple[int, int] = (64, 48)) -> Image.Image:
    # 画素ごとに値が違う画像（無劣化の確認で、単色だと差が出ないため）。
    image = Image.new("RGB", size)
    image.putdata(
        [(x * 4 % 256, y * 5 % 256, (x + y) % 256) for y in range(size[1]) for x in range(size[0])]
    )
    return image


def make_exif(*, orientation: int | None = None) -> Image.Exif:
    exif = Image.Exif()
    exif[ExifTags.Base.Make] = "TestCamera"
    if orientation is not None:
        exif[ExifTags.Base.Orientation] = orientation
    gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
    gps[ExifTags.GPS.GPSLatitudeRef] = "N"
    gps[ExifTags.GPS.GPSLatitude] = (35.0, 40.0, 52.0)
    gps[ExifTags.GPS.GPSProcessingMethod] = GPS_MARKER
    return exif


def save_jpeg(image: Image.Image, **params) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=90, **params)
    return buffer.getvalue()


def segment(marker: int, payload: bytes) -> bytes:
    return bytes([0xFF, marker]) + (len(payload) + 2).to_bytes(2, "big") + payload


def insert_after_soi(data: bytes, *segments: bytes) -> bytes:
    return data[:2] + b"".join(segments) + data[2:]


def decoded_pixels(data: bytes) -> bytes:
    with Image.open(io.BytesIO(data)) as image:
        return image.convert("RGB").tobytes()


def markers(data: bytes) -> list[int]:
    """SOS より前のヘッダー部分のマーカー一覧（テストの確認用の簡易版）。"""
    found = []
    pos = 2
    while pos < len(data):
        marker = data[pos + 1]
        found.append(marker)
        if marker == 0xDA:
            break
        pos += 2 + int.from_bytes(data[pos + 2 : pos + 4], "big")
    return found


class TestStripJpegMetadata:
    def test_removes_exif_with_gps_without_changing_pixels(self) -> None:
        image = make_image()
        data = save_jpeg(image, exif=make_exif())
        assert GPS_MARKER in data

        cleaned = strip_jpeg_metadata(data)

        assert GPS_MARKER not in cleaned
        assert b"TestCamera" not in cleaned
        assert 0xE1 not in markers(cleaned)
        with Image.open(io.BytesIO(cleaned)) as reopened:
            assert dict(reopened.getexif()) == {}
        assert decoded_pixels(cleaned) == decoded_pixels(data)
        # エントロピー符号化データ以降はバイト列のまま（再エンコードしていない）。
        sos = data.index(b"\xff\xda")
        assert cleaned.endswith(data[sos:])

    # 偽の MPF セグメントを入れるので、Pillow が MPO として読めない旨の警告を出す（意図どおり）。
    @pytest.mark.filterwarnings("ignore:Image appears to be a malformed MPO file")
    def test_removes_xmp_comment_iptc_and_mpf_segments(self) -> None:
        data = save_jpeg(
            make_image(), xmp=b"<x:xmpmeta>XMP-SECRET</x:xmpmeta>", comment=b"COM-SECRET"
        )
        data = insert_after_soi(
            data,
            segment(0xED, b"Photoshop 3.0\x00IPTC-SECRET"),
            segment(0xE2, b"MPF\x00MPF-SECRET"),
            segment(0xE5, b"VENDOR-SECRET"),
        )

        cleaned = strip_jpeg_metadata(data)

        for secret in (
            b"XMP-SECRET",
            b"COM-SECRET",
            b"IPTC-SECRET",
            b"MPF-SECRET",
            b"VENDOR-SECRET",
        ):
            assert secret not in cleaned
        assert decoded_pixels(cleaned) == decoded_pixels(data)

    def test_removes_trailing_data_after_eoi(self) -> None:
        data = save_jpeg(make_image())
        embedded = save_jpeg(make_image((8, 8)), exif=make_exif())

        cleaned = strip_jpeg_metadata(data + embedded)

        assert cleaned == data
        assert GPS_MARKER not in cleaned

    def test_removes_mpo_secondary_image_with_its_exif(self) -> None:
        buffer = io.BytesIO()
        secondary = make_image((16, 12))
        secondary.encoderinfo = {"exif": make_exif()}
        make_image().save(buffer, format="MPO", save_all=True, append_images=[secondary])
        data = buffer.getvalue()
        assert data.count(b"\xff\xd8") >= 2
        assert GPS_MARKER in data

        cleaned = strip_jpeg_metadata(data)

        assert cleaned.count(b"\xff\xd8") == 1
        assert b"MPF\x00" not in cleaned
        with Image.open(io.BytesIO(cleaned)) as reopened:
            assert reopened.format == "JPEG"
        assert decoded_pixels(cleaned) == decoded_pixels(data)

    def test_keeps_jfif_icc_profile_and_adobe_segments(self) -> None:
        icc = b"FAKE-ICC-PROFILE"
        data = save_jpeg(make_image(), icc_profile=icc)
        data = data[:2] + data[2:].replace(
            b"\xff\xdb", segment(0xEE, b"Adobe\x00\x64\x00\x00\x00\x00\x01") + b"\xff\xdb", 1
        )

        cleaned = strip_jpeg_metadata(data)

        assert cleaned == data
        with Image.open(io.BytesIO(cleaned)) as reopened:
            assert reopened.info["icc_profile"] == icc
            assert "jfif" in reopened.info

    def test_returns_same_bytes_when_nothing_to_remove(self) -> None:
        data = make_jpeg_bytes((100, 100))

        assert strip_jpeg_metadata(data) == data

    def test_progressive_jpeg_with_multiple_scans(self) -> None:
        image = make_image((96, 80))
        data = save_jpeg(image, progressive=True, exif=make_exif())
        assert data.count(b"\xff\xda") > 1

        cleaned = strip_jpeg_metadata(data)

        assert GPS_MARKER not in cleaned
        assert cleaned.count(b"\xff\xda") == data.count(b"\xff\xda")
        assert decoded_pixels(cleaned) == decoded_pixels(data)

    def test_restart_markers_in_scan_are_kept(self) -> None:
        data = save_jpeg(make_image((96, 80)), restart_marker_blocks=1, exif=make_exif())

        cleaned = strip_jpeg_metadata(data)

        assert GPS_MARKER not in cleaned
        assert decoded_pixels(cleaned) == decoded_pixels(data)

    def test_keeps_only_orientation_as_minimal_exif(self) -> None:
        data = save_jpeg(make_image(), exif=make_exif(orientation=6))

        cleaned = strip_jpeg_metadata(data)

        assert GPS_MARKER not in cleaned
        with Image.open(io.BytesIO(cleaned)) as reopened:
            assert dict(reopened.getexif()) == {ExifTags.Base.Orientation: 6}
        # JFIF の APP0 の直後に置く。
        assert markers(cleaned)[:2] == [0xE0, 0xE1]
        assert decoded_pixels(cleaned) == decoded_pixels(data)

    def test_orientation_1_is_not_written_back(self) -> None:
        data = save_jpeg(make_image(), exif=make_exif(orientation=1))

        cleaned = strip_jpeg_metadata(data)

        assert 0xE1 not in markers(cleaned)

    def test_thumbnail_from_cleaned_bytes_keeps_orientation(self) -> None:
        image = make_image((60, 30))
        data = save_jpeg(image, exif=make_exif(orientation=6))

        thumbnail = make_thumbnail(
            strip_jpeg_metadata(data), max_edge=60, quality=80, max_pixels=10_000
        )

        with Image.open(io.BytesIO(data)) as original:
            expected = ImageOps.exif_transpose(original)
        assert (thumbnail.width, thumbnail.height) == expected.size == (30, 60)

    def test_broken_exif_is_dropped_without_orientation(self) -> None:
        data = insert_after_soi(
            save_jpeg(make_image()), segment(0xE1, b"Exif\x00\x00BROKEN-SECRET")
        )

        cleaned = strip_jpeg_metadata(data)

        assert b"BROKEN-SECRET" not in cleaned
        assert 0xE1 not in markers(cleaned)

    @pytest.mark.parametrize(
        "data",
        [
            pytest.param(b"", id="empty"),
            pytest.param(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16, id="not-jpeg"),
            pytest.param(b"\xff\xd8\xff\xe1\x00\x01", id="segment-length-too-small"),
            pytest.param(b"\xff\xd8\xff\xe1\xff\xff\x00", id="segment-longer-than-data"),
            pytest.param(b"\xff\xd8\x00\x00\x00\x00", id="no-marker"),
        ],
    )
    def test_malformed_input_raises(self, data: bytes) -> None:
        with pytest.raises(InvalidImageError):
            strip_jpeg_metadata(data)

    def test_missing_eoi_raises(self) -> None:
        data = save_jpeg(make_image())

        with pytest.raises(InvalidImageError):
            strip_jpeg_metadata(data[:-2])
