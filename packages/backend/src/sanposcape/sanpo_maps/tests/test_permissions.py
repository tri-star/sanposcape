from sanposcape.sanpo_maps.permissions import can_add_pin, can_add_pin_photo


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
