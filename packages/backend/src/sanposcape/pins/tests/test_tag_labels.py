import pytest

from sanposcape.pins.tag_labels import dedupe_tags, normalize_tag_label, tag_key


class TestNormalizeTagLabel:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("  桜  ", "桜"),
            ("#桜", "桜"),
            ("＃桜", "桜"),
            ("##桜", "桜"),
            ("桜  の  トンネル", "桜 の トンネル"),
            ("Cafe", "Cafe"),
            ("🌸", "🌸"),
        ],
    )
    def test_normalizes(self, raw: str, expected: str) -> None:
        assert normalize_tag_label(raw) == expected

    def test_symbols_and_whitespace_only_becomes_empty(self) -> None:
        assert normalize_tag_label("  ###  ") == ""


class TestTagKey:
    def test_case_insensitive(self) -> None:
        assert tag_key("Cafe") == tag_key("cafe")

    def test_hash_prefix_does_not_affect_key(self) -> None:
        assert tag_key("#桜") == tag_key("桜")


class TestDedupeTags:
    def test_removes_case_insensitive_duplicates_keeping_first(self) -> None:
        assert dedupe_tags(["Cafe", "cafe", "CAFE"]) == ["Cafe"]

    def test_normalizes_before_deduping(self) -> None:
        assert dedupe_tags(["#桜", "桜", " 桜 "]) == ["桜"]

    def test_preserves_order_of_first_occurrence(self) -> None:
        assert dedupe_tags(["b", "a", "b", "c"]) == ["b", "a", "c"]

    def test_empty_after_normalization_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="empty after normalization"):
            dedupe_tags(["###"])

    def test_empty_list_returns_empty_list(self) -> None:
        assert dedupe_tags([]) == []
