"""OpenAPI 契約テスト（`pins/tests/test_openapi_contract.py` と同じ形）。

コミット済みの `openapi.yaml` が sanpo_maps ドメインの契約（operationId・
required/nullable・minLength/maxLength 等）を保っていることを固定する。mobile の
Orval はこの定義からクライアントを生成するため、意図しない破壊的変更を検知する。
"""

from pathlib import Path

import yaml

_OPENAPI_PATH = Path(__file__).parents[5] / "openapi.yaml"


def _load_committed_openapi() -> dict:
    return yaml.safe_load(_OPENAPI_PATH.read_text())


class TestOperationIds:
    def test_expected_operation_ids_are_declared(self) -> None:
        document = _load_committed_openapi()
        assert document["paths"]["/sanpo-maps"]["get"]["operationId"] == "list_sanpo_maps"
        assert document["paths"]["/sanpo-maps"]["post"]["operationId"] == "create_sanpo_map"
        assert (
            document["paths"]["/sanpo-maps/{sanpo_map_id}"]["patch"]["operationId"]
            == "update_sanpo_map"
        )
        assert (
            document["paths"]["/sanpo-maps/{sanpo_map_id}"]["delete"]["operationId"]
            == "delete_sanpo_map"
        )
        assert (
            document["paths"]["/sanpo-maps/{sanpo_map_id}/tags"]["get"]["operationId"]
            == "list_sanpo_map_tags"
        )


class TestCreateSanpoMapResponses:
    def test_201_uses_sanpo_map_read(self) -> None:
        document = _load_committed_openapi()
        schema = document["paths"]["/sanpo-maps"]["post"]["responses"]["201"]["content"][
            "application/json"
        ]["schema"]
        assert schema == {"$ref": "#/components/schemas/SanpoMapRead"}


class TestUpdateAndDeleteResponses:
    def test_update_sanpo_map_declares_403_and_404(self) -> None:
        document = _load_committed_openapi()
        responses = document["paths"]["/sanpo-maps/{sanpo_map_id}"]["patch"]["responses"]
        assert "403" in responses
        assert "404" in responses

    def test_delete_sanpo_map_declares_204_403_404_and_not_503(self) -> None:
        document = _load_committed_openapi()
        responses = document["paths"]["/sanpo-maps/{sanpo_map_id}"]["delete"]["responses"]
        assert "204" in responses
        assert "403" in responses
        assert "404" in responses
        assert "503" not in responses


class TestSanpoMapReadSchema:
    def test_pin_count_is_optional_and_nullable(self) -> None:
        document = _load_committed_openapi()
        schema = document["components"]["schemas"]["SanpoMapRead"]
        assert "pin_count" not in schema.get("required", [])
        types = {item.get("type") for item in schema["properties"]["pin_count"]["anyOf"]}
        assert "integer" in types
        assert "null" in types


class TestListSanpoMapsExpandParameter:
    def _expand_parameter(self) -> dict:
        document = _load_committed_openapi()
        params = document["paths"]["/sanpo-maps"]["get"]["parameters"]
        return next(param for param in params if param["name"] == "expand")

    def test_expand_is_an_optional_array(self) -> None:
        param = self._expand_parameter()
        assert param["required"] is False
        assert param["schema"]["type"] == "array"

    def test_expand_items_are_fixed_to_pin_count(self) -> None:
        """値が1つしかない `Literal` は pydantic の JSON Schema では `enum` ではなく
        `const` になる（`PinTagConflictErrorRead.code` と同じ形, SS-112）。
        """
        param = self._expand_parameter()
        assert param["schema"]["items"]["const"] == "pin_count"


class TestSanpoMapCreateSchema:
    def test_name_min_and_max_length(self) -> None:
        document = _load_committed_openapi()
        schema = document["components"]["schemas"]["SanpoMapCreate"]["properties"]["name"]
        assert schema["minLength"] == 1
        assert schema["maxLength"] == 50

    def test_name_is_required(self) -> None:
        document = _load_committed_openapi()
        schema = document["components"]["schemas"]["SanpoMapCreate"]
        assert "name" in schema["required"]


class TestSanpoMapUpdateSchema:
    def test_additional_properties_is_false(self) -> None:
        document = _load_committed_openapi()
        schema = document["components"]["schemas"]["SanpoMapUpdate"]
        assert schema["additionalProperties"] is False

    def test_name_is_optional_and_not_nullable(self) -> None:
        """`SkipJsonSchema[None]` のため、素の文字列スキーマになり `anyOf` で null を
        許容する形にはならない（`PinCreate.sanpo_map_id` と同じ仕組み, SS-88/SS-112）。
        """
        document = _load_committed_openapi()
        schema = document["components"]["schemas"]["SanpoMapUpdate"]
        assert "name" not in schema.get("required", [])
        assert schema["properties"]["name"]["type"] == "string"

    def test_name_max_length_is_50(self) -> None:
        document = _load_committed_openapi()
        schema = document["components"]["schemas"]["SanpoMapUpdate"]["properties"]["name"]
        assert schema["maxLength"] == 50


class TestListSanpoMapTagsContract:
    _PATH = "/sanpo-maps/{sanpo_map_id}/tags"

    def _operation(self) -> dict:
        return _load_committed_openapi()["paths"][self._PATH]["get"]

    def test_is_grouped_under_sanpo_maps_tag(self) -> None:
        """mobile の Orval（tags-split）の出力先 `endpoints/sanpo-maps/` を固定する。"""
        assert self._operation()["tags"] == ["sanpo-maps"]

    def test_200_uses_sanpo_map_tag_list_read(self) -> None:
        schema = self._operation()["responses"]["200"]["content"]["application/json"]["schema"]
        assert schema == {"$ref": "#/components/schemas/SanpoMapTagListRead"}

    def test_declares_401_404_413_422_and_not_403_503(self) -> None:
        responses = self._operation()["responses"]
        for status in ("401", "404", "413", "422"):
            assert status in responses
        assert "403" not in responses
        assert "503" not in responses

    def test_limit_parameter(self) -> None:
        params = self._operation()["parameters"]
        limit = next(param for param in params if param["name"] == "limit")
        assert limit["required"] is False
        assert limit["schema"]["type"] == "integer"
        assert limit["schema"]["default"] == 100
        assert limit["schema"]["minimum"] == 1
        assert limit["schema"]["maximum"] == 200

    def test_schemas_have_only_label_and_pin_count(self) -> None:
        schemas = _load_committed_openapi()["components"]["schemas"]
        tag = schemas["SanpoMapTagRead"]
        assert set(tag["required"]) == {"label", "pin_count"}
        assert set(tag["properties"]) == {"label", "pin_count"}
        assert schemas["SanpoMapTagListRead"]["required"] == ["items"]
