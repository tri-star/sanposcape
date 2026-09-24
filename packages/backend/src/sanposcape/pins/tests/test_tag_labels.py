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

    def test_length_is_checked_after_normalization(self) -> None:
        """PR #93 T5: 先頭の `#` や前後の空白を含めた生の長さではなく、正規化後の長さで
        20文字制限を判定する（mobile の正規化契約と揃える）。
        """
        raw = "#" + ("桜" * 20) + "  "  # 生の長さは23文字だが、正規化後は20文字。
        assert dedupe_tags([raw]) == ["桜" * 20]

    def test_length_over_limit_after_normalization_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="exceeds 20 characters"):
            dedupe_tags(["桜" * 21])

    def test_custom_max_length(self) -> None:
        assert dedupe_tags(["abc"], max_length=3) == ["abc"]
        with pytest.raises(ValueError, match="exceeds 3 characters"):
            dedupe_tags(["abcd"], max_length=3)
