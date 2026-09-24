import pytest

from sanposcape.sanpo_maps.permissions import (
    can_add_pin,
    can_add_pin_photo,
    can_add_pin_tag,
    can_delete_pin,
    can_delete_pin_photo,
    can_delete_pin_tag,
    can_update_pin,
)


class TestCanAddPin:
    def test_owner_can(self) -> None:
        assert can_add_pin("owner") is True

    def test_editor_can(self) -> None:
        assert can_add_pin("editor") is True


class TestCanAddPinPhoto:
    def test_owner_can(self) -> None:
        assert can_add_pin_photo("owner") is True

    def test_editor_can(self) -> None:
        # 招待ユーザーが owner のピンに写真を足す要件をそのまま満たす。
        assert can_add_pin_photo("editor") is True


class TestCanUpdatePin:
    @pytest.mark.parametrize(
        ("role", "is_creator", "expected"),
        [
            ("owner", True, True),
            ("owner", False, True),
            ("editor", True, True),
            ("editor", False, False),
        ],
    )
    def test_matrix(self, role: str, is_creator: bool, expected: bool) -> None:
        assert can_update_pin(role, is_creator=is_creator) is expected


class TestCanDeletePin:
    @pytest.mark.parametrize(
        ("role", "is_creator", "expected"),
        [
            ("owner", True, True),
            ("owner", False, True),
            ("editor", True, True),
            ("editor", False, False),
        ],
    )
    def test_matrix(self, role: str, is_creator: bool, expected: bool) -> None:
        assert can_delete_pin(role, is_creator=is_creator) is expected


class TestCanAddPinTag:
    def test_owner_can(self) -> None:
        assert can_add_pin_tag("owner") is True

    def test_editor_can(self) -> None:
        assert can_add_pin_tag("editor") is True


class TestCanDeletePinTag:
    @pytest.mark.parametrize(
        ("role", "is_creator", "expected"),
        [
            ("owner", True, True),
            ("owner", False, True),
            ("editor", True, True),
            ("editor", False, False),
        ],
    )
    def test_matrix(self, role: str, is_creator: bool, expected: bool) -> None:
        assert can_delete_pin_tag(role, is_creator=is_creator) is expected


class TestCanDeletePinPhoto:
    @pytest.mark.parametrize(
        ("role", "is_uploader", "expected"),
        [
            ("owner", True, True),
            ("owner", False, True),
            ("editor", True, True),
            ("editor", False, False),
        ],
    )
    def test_matrix(self, role: str, is_uploader: bool, expected: bool) -> None:
        assert can_delete_pin_photo(role, is_uploader=is_uploader) is expected


class TestUnknownRoleIsFailSafe:
    """未知の role は常に False（fail-safe）。"""

    def test_can_update_pin(self) -> None:
        assert can_update_pin("unknown", is_creator=True) is False

    def test_can_delete_pin(self) -> None:
        assert can_delete_pin("unknown", is_creator=True) is False

    def test_can_add_pin_tag(self) -> None:
        assert can_add_pin_tag("unknown") is False

    def test_can_delete_pin_tag(self) -> None:
        assert can_delete_pin_tag("unknown", is_creator=True) is False

    def test_can_delete_pin_photo(self) -> None:
        assert can_delete_pin_photo("unknown", is_uploader=True) is False
