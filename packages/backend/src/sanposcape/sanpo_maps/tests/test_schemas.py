import pytest
from pydantic import ValidationError

from sanposcape.sanpo_maps.schemas import SanpoMapCreate, SanpoMapListQuery, SanpoMapUpdate


class TestSanpoMapCreate:
    def test_strips_leading_and_trailing_whitespace(self) -> None:
        payload = SanpoMapCreate(name="  近所の地図  ")
        assert payload.name == "近所の地図"

    def test_strips_full_width_space(self) -> None:
        payload = SanpoMapCreate(name="　近所の地図　")
        assert payload.name == "近所の地図"

    def test_blank_only_name_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            SanpoMapCreate(name="   ")

    def test_name_at_max_length_is_accepted(self) -> None:
        payload = SanpoMapCreate(name="あ" * 50)
        assert len(payload.name) == 50

    def test_name_over_max_length_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            SanpoMapCreate(name="あ" * 51)

    def test_emoji_counts_as_a_single_character(self) -> None:
        # サロゲートペアを要する絵文字1文字が code point 1個として数えられることを確認する。
        payload = SanpoMapCreate(name="🌳" * 50)
        assert len(payload.name) == 50
        with pytest.raises(ValidationError):
            SanpoMapCreate(name="🌳" * 51)

    def test_name_is_required(self) -> None:
        with pytest.raises(ValidationError):
            SanpoMapCreate()  # type: ignore[call-arg]


class TestSanpoMapUpdate:
    def test_empty_body_omits_name(self) -> None:
        payload = SanpoMapUpdate()
        assert "name" not in payload.model_fields_set
        assert payload.name is None

    def test_explicit_null_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            SanpoMapUpdate.model_validate({"name": None})

    def test_extra_field_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            SanpoMapUpdate.model_validate({"name": "新しい名前", "is_default": True})

    def test_strips_whitespace(self) -> None:
        payload = SanpoMapUpdate(name="  新しい名前  ")
        assert payload.name == "新しい名前"

    def test_blank_only_name_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            SanpoMapUpdate(name="   ")

    def test_name_over_max_length_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            SanpoMapUpdate(name="あ" * 51)


class TestSanpoMapListQuery:
    def test_default_expand_is_empty(self) -> None:
        query = SanpoMapListQuery()
        assert query.expand == []

    def test_pin_count_is_accepted(self) -> None:
        query = SanpoMapListQuery(expand=["pin_count"])
        assert query.expand == ["pin_count"]

    def test_unknown_expand_value_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            SanpoMapListQuery(expand=["unknown"])
