import pytest
from pydantic import ValidationError

from sanposcape.sanpo_maps.maps.schemas import SanpoMapCreate, SanpoMapListQuery, SanpoMapUpdate
from sanposcape.sanpo_maps.models import SanpoMapIcon

EXPECTED_ICONS = [
    "pin",
    "tree",
    "flower",
    "leaf",
    "sun",
    "rain",
    "retreat",
    "landmark",
    "coffee",
    "food",
    "bakery",
    "shopping",
    "cat",
]


class TestSanpoMapIcon:
    def test_values_and_order_match_the_mobile_contract(self) -> None:
        # mobile との契約。値を変えるときは意図的にここも直す（ADR-009 決定31）。
        assert [icon.value for icon in SanpoMapIcon] == EXPECTED_ICONS


class TestSanpoMapCreate:
    def test_icon_defaults_to_pin(self) -> None:
        assert SanpoMapCreate(name="地図").icon == SanpoMapIcon.PIN

    @pytest.mark.parametrize("icon", EXPECTED_ICONS)
    def test_accepts_every_icon(self, icon: str) -> None:
        assert SanpoMapCreate(name="地図", icon=icon).icon == SanpoMapIcon(icon)  # type: ignore[arg-type]

    @pytest.mark.parametrize("icon", [None, "unknown", "PIN", 1])
    def test_invalid_icon_is_rejected(self, icon: object) -> None:
        with pytest.raises(ValidationError):
            SanpoMapCreate.model_validate({"name": "地図", "icon": icon})

    def test_strips_leading_and_trailing_whitespace(self) -> None:
        payload = SanpoMapCreate(name="  近所の地図  ")
        assert payload.name == "近所の地図"

    def test_strips_full_width_space(self) -> None:
        payload = SanpoMapCreate(name="　近所の地図　")
        assert payload.name == "近所の地図"

    def test_strips_nbsp(self) -> None:
        # `str.strip()` は NBSP（U+00A0）も Unicode の空白として除去する
        # （明示的な文字集合を書いた `strip(" \t\n\r\f\v　")` とは違い、`pins/schemas.py`
        # の `_blank_to_none`（`str.strip()`）と挙動が揃う）。
        payload = SanpoMapCreate(name=" 近所の地図 ")
        assert payload.name == "近所の地図"

    def test_blank_only_name_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            SanpoMapCreate(name="   ")

    def test_blank_only_name_with_nbsp_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            SanpoMapCreate(name=" 　")

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

    def test_empty_body_does_not_set_icon(self) -> None:
        assert "icon" not in SanpoMapUpdate().model_fields_set

    def test_icon_only_is_accepted(self) -> None:
        payload = SanpoMapUpdate.model_validate({"icon": "cat"})
        assert payload.icon == SanpoMapIcon.CAT
        assert "name" not in payload.model_fields_set

    def test_name_and_icon_are_accepted_together(self) -> None:
        payload = SanpoMapUpdate.model_validate({"name": "新名", "icon": "cat"})
        assert payload.name == "新名"
        assert payload.icon == SanpoMapIcon.CAT

    @pytest.mark.parametrize("icon", [None, "unknown", "DOG"])
    def test_invalid_icon_is_rejected(self, icon: object) -> None:
        with pytest.raises(ValidationError):
            SanpoMapUpdate.model_validate({"icon": icon})

    def test_strips_whitespace(self) -> None:
        payload = SanpoMapUpdate(name="  新しい名前  ")
        assert payload.name == "新しい名前"

    def test_strips_nbsp(self) -> None:
        payload = SanpoMapUpdate(name=" 新しい名前 ")
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

    def test_too_many_expand_values_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            SanpoMapListQuery.model_validate({"expand": ["pin_count"] * 9})
