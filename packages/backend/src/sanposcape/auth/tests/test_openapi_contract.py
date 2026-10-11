"""`POST /auth/session` の OpenAPI 契約テスト（コミット済み `openapi.yaml` を読む）。

mobile の Orval はこの定義からクライアントを生成する。`nonce` / `display_name` は任意
（required に足さない）ことで、既存の呼び出しを壊さない。
"""

from pathlib import Path

import yaml

_OPENAPI_PATH = Path(__file__).parents[4] / "openapi.yaml"


def _session_create_schema() -> dict:
    document = yaml.safe_load(_OPENAPI_PATH.read_text())
    return document["components"]["schemas"]["SessionCreate"]


def _non_null(schema: dict) -> dict:
    return next(s for s in schema["anyOf"] if s.get("type") != "null")


def test_provider_enum_includes_apple() -> None:
    assert _session_create_schema()["properties"]["provider"]["enum"] == ["google", "apple"]


def test_only_provider_and_id_token_are_required() -> None:
    assert _session_create_schema()["required"] == ["provider", "id_token"]


def test_nonce_is_optional_with_length_bounds() -> None:
    nonce = _non_null(_session_create_schema()["properties"]["nonce"])

    assert nonce["type"] == "string"
    assert nonce["minLength"] == 16
    assert nonce["maxLength"] == 256


def test_display_name_is_optional_with_max_length() -> None:
    display_name = _non_null(_session_create_schema()["properties"]["display_name"])

    assert display_name["type"] == "string"
    assert display_name["maxLength"] == 255
