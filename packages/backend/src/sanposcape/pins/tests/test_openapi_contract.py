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
        assert (
            document["paths"]["/pin-photo-uploads/{upload_id}"]["delete"]["operationId"]
            == "delete_pin_photo_upload"
        )
        # SS-111（閲覧 API）
        assert document["paths"]["/pins"]["get"]["operationId"] == "list_pins"
        assert document["paths"]["/pins/{pin_id}"]["get"]["operationId"] == "get_pin"
        assert document["paths"]["/pins/{pin_id}/photos"]["get"]["operationId"] == "list_pin_photos"


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

    def test_original_url_is_required_and_nullable(self) -> None:
        """ADR-009 決定16: `original_url` は必須キーだが値は null 許容。"""
        document = _load_committed_openapi()
        schema = document["components"]["schemas"]["PinPhotoRead"]
        assert "original_url" in schema["required"]
        original_url_schema = schema["properties"]["original_url"]
        types = {item.get("type") for item in original_url_schema.get("anyOf", [])}
        assert "string" in types
        assert "null" in types


class TestListPinsQuerySchema:
    """SS-111: `GET /pins` のクエリパラメータの契約。"""

    def _parameters(self) -> dict[str, dict]:
        document = _load_committed_openapi()
        params = document["paths"]["/pins"]["get"]["parameters"]
        return {param["name"]: param for param in params}

    def test_sanpo_map_id_is_required(self) -> None:
        params = self._parameters()
        assert params["sanpo_map_id"]["required"] is True

    def test_bounding_box_is_four_separate_optional_parameters(self) -> None:
        params = self._parameters()
        for name in ("min_latitude", "min_longitude", "max_latitude", "max_longitude"):
            assert name in params
            assert params[name]["required"] is False

    def test_limit_maximum_is_200(self) -> None:
        params = self._parameters()
        schema = params["limit"]["schema"]
        assert schema["maximum"] == 200
        assert schema["default"] == 50

    def test_tags_is_an_array_parameter(self) -> None:
        params = self._parameters()
        schema = params["tags"]["schema"]
        assert schema["type"] == "array"
        assert schema["maxItems"] == 10

    def test_q_max_length_is_100(self) -> None:
        params = self._parameters()
        schema = params["q"]["schema"]
        string_schema = next(item for item in schema["anyOf"] if item.get("type") == "string")
        assert string_schema["maxLength"] == 100


class TestListPinPhotosQuerySchema:
    def test_limit_maximum_is_100(self) -> None:
        document = _load_committed_openapi()
        params = {
            param["name"]: param
            for param in document["paths"]["/pins/{pin_id}/photos"]["get"]["parameters"]
        }
        schema = params["limit"]["schema"]
        assert schema["maximum"] == 100
        assert schema["default"] == 30


class TestReadEndpointsResponses:
    """SS-111: 3つの GET は 404 を宣言し、503 は宣言しない（D11）。"""

    def test_list_pins_declares_404_and_not_503(self) -> None:
        document = _load_committed_openapi()
        responses = document["paths"]["/pins"]["get"]["responses"]
        assert "404" in responses
        assert "400" in responses
        assert "503" not in responses

    def test_get_pin_declares_404_and_not_503(self) -> None:
        document = _load_committed_openapi()
        responses = document["paths"]["/pins/{pin_id}"]["get"]["responses"]
        assert "404" in responses
        assert "503" not in responses

    def test_list_pin_photos_declares_404_and_not_503(self) -> None:
        document = _load_committed_openapi()
        responses = document["paths"]["/pins/{pin_id}/photos"]["get"]["responses"]
        assert "404" in responses
        assert "400" in responses
        assert "503" not in responses


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
