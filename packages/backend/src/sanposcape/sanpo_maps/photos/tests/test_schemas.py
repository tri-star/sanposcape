from datetime import datetime

import pytest
from pydantic import ValidationError

from sanposcape.sanpo_maps.photos.schemas import PinPhotoUploadCreate


def _build(**extra: object) -> PinPhotoUploadCreate:
    return PinPhotoUploadCreate.model_validate(
        {"content_type": "image/jpeg", "byte_size": 1, **extra}
    )


class TestPinPhotoUploadCreateTakenAt:
    def test_defaults_to_none_when_omitted(self) -> None:
        assert _build().taken_at is None

    def test_accepts_explicit_null(self) -> None:
        assert _build(taken_at=None).taken_at is None

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("2026-07-02T09:14:05+09:00", "2026-07-02T09:14:05+09:00"),
            ("2026-07-02T00:14:05Z", "2026-07-02T09:14:05+09:00"),
            ("1900-01-01T00:00:00Z", "1900-01-01T00:00:00+00:00"),
            ("2099-12-31T23:59:59Z", "2099-12-31T23:59:59+00:00"),
            # 瞬間では 2099-12-31T23:59:59Z（上端の手前）。
            ("2100-01-01T08:59:59+09:00", "2099-12-31T23:59:59+00:00"),
        ],
    )
    def test_accepts_aware_values_in_range(self, raw: str, expected: str) -> None:
        taken_at = _build(taken_at=raw).taken_at

        assert taken_at == datetime.fromisoformat(expected)

    @pytest.mark.parametrize(
        "raw",
        [
            "2026-07-02T09:14:05",  # naive
            "2026-07-02",  # 日付だけ
            "JST",
            "",
            "1899-12-31T23:59:59Z",
            # オフセットを考慮すると下端より前（= 1899-12-31T23:59:59Z）。
            "1900-01-01T08:59:59+09:00",
            "2100-01-01T00:00:00Z",  # 上端は含まない
            "0001-01-01T00:00:00+09:00",
            "9999-12-31T23:59:59-14:00",
        ],
    )
    def test_rejects_invalid_values_with_validation_error(self, raw: str) -> None:
        with pytest.raises(ValidationError):
            _build(taken_at=raw)

    def test_ignores_unknown_keys(self) -> None:
        # ADR-009 決定34: 古い/新しい backend とアプリの組み合わせで
        # 未知のキーを無視する契約を固定する。
        payload = _build(unknown=1)

        assert not hasattr(payload, "unknown")
