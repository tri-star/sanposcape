"""OpenAPI 契約テスト（`maps/tests/test_router.py` の `expected_contract` と同じ形）。

コミット済みの `openapi.yaml` が pins/sanpo_maps ドメインの契約（operationId・
required/nullable・maxItems 等）を保っていることを固定する。mobile の Orval は
この定義からクライアントを生成するため、意図しない破壊的変更を検知する。
"""

from pathlib import Path

import yaml

from sanposcape.config import Settings
from sanposcape.main import create_app

_OPENAPI_PATH = Path(__file__).parents[4] / "openapi.yaml"


def _load_committed_openapi() -> dict:
    return yaml.safe_load(_OPENAPI_PATH.read_text())


class TestOperationIds:
    def test_expected_operation_ids_are_declared(self) -> None:
        document = _load_committed_openapi()
        assert document["paths"]["/sanpo-maps"]["get"]["operationId"] == "list_sanpo_maps"
        assert document["paths"]["/pins"]["post"]["operationId"] == "create_pin"
        assert document["paths"]["/pins/{pin_id}/photos"]["post"]["operationId"] == "add_pin_photos"
        assert (
            document["paths"]["/pin-photo-uploads"]["post"]["operationId"]
            == "create_pin_photo_upload"
        )


class TestCreatePinResponses:
    def test_both_200_and_201_use_pin_read(self) -> None:
        document = _load_committed_openapi()
        responses = document["paths"]["/pins"]["post"]["responses"]
        for status_code in ("200", "201"):
            schema = responses[status_code]["content"]["application/json"]["schema"]
            assert schema == {"$ref": "#/components/schemas/PinRead"}


class TestPinCreateSchema:
    def test_sanpo_map_id_is_optional_and_not_nullable(self) -> None:
        document = _load_committed_openapi()
        pin_create = document["components"]["schemas"]["PinCreate"]
        assert "sanpo_map_id" not in pin_create.get("required", [])
        sanpo_map_id_schema = pin_create["properties"]["sanpo_map_id"]
        # SkipJsonSchema[None] のため、素の `{"type": "string", "format": "uuid"}` になり
        # `anyOf` で null を許容する形にはならない。
        assert sanpo_map_id_schema.get("type") == "string"
        assert sanpo_map_id_schema.get("format") == "uuid"

    def test_photo_upload_ids_max_items_is_10(self) -> None:
        document = _load_committed_openapi()
        pin_create = document["components"]["schemas"]["PinCreate"]
        assert pin_create["properties"]["photo_upload_ids"]["maxItems"] == 10

    def test_tags_max_items_is_10(self) -> None:
        document = _load_committed_openapi()
        pin_create = document["components"]["schemas"]["PinCreate"]
        assert pin_create["properties"]["tags"]["maxItems"] == 10

    def test_tag_item_max_length_is_the_raw_safety_limit_not_the_public_20(self) -> None:
        """PR #93 T5: 公開上限（20文字）は正規化後に検証するため、ここに出る `maxLength`
        は生入力に対する安全上限（200）になる。mobile 側の型もこれに合わせて緩める。
        """
        document = _load_committed_openapi()
        pin_create = document["components"]["schemas"]["PinCreate"]
        assert pin_create["properties"]["tags"]["items"]["maxLength"] == 200


class TestPinPhotoReadSchema:
    def test_thumbnail_is_nullable(self) -> None:
        document = _load_committed_openapi()
        thumbnail_schema = document["components"]["schemas"]["PinPhotoRead"]["properties"][
            "thumbnail"
        ]
        types = {item.get("type") for item in thumbnail_schema.get("anyOf", [])}
        assert "null" in types


class TestPinConflictErrorSchema:
    """PR #93 T15: 409 応答の機械可読な `code` フィールド。"""

    def test_code_enum_has_both_values(self) -> None:
        document = _load_committed_openapi()
        code_schema = document["components"]["schemas"]["PinConflictErrorRead"]["properties"][
            "code"
        ]
        assert set(code_schema["enum"]) == {"storage_quota_exceeded", "photo_upload_not_ready"}

    def test_create_pin_409_uses_the_schema(self) -> None:
        document = _load_committed_openapi()
        schema = document["paths"]["/pins"]["post"]["responses"]["409"]["content"][
            "application/json"
        ]["schema"]
        assert schema == {"$ref": "#/components/schemas/PinConflictErrorRead"}

    def test_add_pin_photos_409_uses_the_schema(self) -> None:
        document = _load_committed_openapi()
        schema = document["paths"]["/pins/{pin_id}/photos"]["post"]["responses"]["409"]["content"][
            "application/json"
        ]["schema"]
        assert schema == {"$ref": "#/components/schemas/PinConflictErrorRead"}


class TestRemovedOrHiddenRoutes:
    def test_spots_is_absent(self) -> None:
        document = _load_committed_openapi()
        assert not any(path == "/spots" for path in document["paths"])

    def test_dev_storage_is_absent(self) -> None:
        document = _load_committed_openapi()
        assert not any(path.startswith("/dev-storage") for path in document["paths"])


class TestStorageModeDoesNotAffectPublicSchema:
    def test_fake_and_real_produce_identical_openapi(self) -> None:
        real_settings = Settings(
            env="test",
            auth_mode="real",
            auth_jwt_secret="x" * 32,
            google_allowed_audiences=["test-audience"],
            storage_mode="real",
        )
        fake_settings = Settings(
            env="test",
            auth_mode="real",
            auth_jwt_secret="x" * 32,
            google_allowed_audiences=["test-audience"],
            storage_mode="fake",
        )
        real_app = create_app(real_settings)
        fake_app = create_app(fake_settings)

        assert real_app.openapi() == fake_app.openapi()
