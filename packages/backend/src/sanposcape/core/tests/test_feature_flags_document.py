"""`feature-flags.json`（フラグ定義ファイル）と `scripts/feature_flags_document.py` のテスト。

定義ファイルのキー集合と登録簿（`FEATURE_FLAGS`）の一致は ADR-008 追補 D9 の推奨。
スクリプトは標準ライブラリ縛りでパッケージ外にあるため、パスから読み込む。
"""

import copy
import importlib.util
import json
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

from sanposcape.core.feature_flags import FEATURE_FLAGS, FLAG_KEY_PATTERN, RESERVED_FLAG_KEYS

BACKEND_ROOT = Path(__file__).resolve().parents[4]
DEFINITIONS_PATH = BACKEND_ROOT / "feature-flags.json"


def _load_script() -> ModuleType:
    path = BACKEND_ROOT / "scripts" / "feature_flags_document.py"
    spec = importlib.util.spec_from_file_location("feature_flags_document", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


script = _load_script()


@pytest.fixture
def definitions() -> dict[str, Any]:
    return {
        "version": "1",
        "flags": {
            "client_requirements": {
                "name": "client requirements",
                "attributes": {
                    "ios_minimum_version": {"constraints": {"type": "string"}},
                    "android_minimum_version": {"constraints": {"type": "string"}},
                },
            },
            "walk_sharing": {"name": "walk sharing"},
            "route_replay": {"name": "route replay"},
        },
        "values": {
            "client_requirements": {"enabled": True},
            "walk_sharing": {"enabled": False},
            "route_replay": {"enabled": False},
        },
    }


# --- 定義ファイルと登録簿の一致 ---


def test_definitions_file_is_valid() -> None:
    script.load_definitions(DEFINITIONS_PATH)


def test_definitions_file_keys_match_the_registry() -> None:
    definitions = json.loads(DEFINITIONS_PATH.read_text(encoding="utf-8"))
    registry_keys = {spec.key for spec in FEATURE_FLAGS} | RESERVED_FLAG_KEYS
    assert set(definitions["flags"]) == registry_keys


def test_script_constants_match_the_registry_module() -> None:
    assert script.FLAG_KEY_PATTERN.pattern == FLAG_KEY_PATTERN.pattern
    assert script.RESERVED_FLAG_KEYS == RESERVED_FLAG_KEYS


# --- 定義ファイルの検査 ---


def test_rejects_a_default_that_is_on(definitions: dict[str, Any]) -> None:
    definitions["values"]["walk_sharing"]["enabled"] = True
    with pytest.raises(script.DocumentError, match="false"):
        script.validate_definitions(definitions)


def test_rejects_client_requirements_default_off(definitions: dict[str, Any]) -> None:
    definitions["values"]["client_requirements"]["enabled"] = False
    with pytest.raises(script.DocumentError, match="true"):
        script.validate_definitions(definitions)


def test_rejects_mismatched_flags_and_values(definitions: dict[str, Any]) -> None:
    del definitions["values"]["route_replay"]
    with pytest.raises(script.DocumentError, match="キー集合"):
        script.validate_definitions(definitions)


def test_rejects_extra_top_level_keys(definitions: dict[str, Any]) -> None:
    definitions["owner"] = "backend"
    with pytest.raises(script.DocumentError, match="トップレベル"):
        script.validate_definitions(definitions)


# --- フラグ名の検査 ---


@pytest.mark.parametrize("flag", ["client_requirements", "unknown_flag", "Bad-Key", ""])
def test_rejects_flags_that_cannot_be_switched(definitions: dict[str, Any], flag: str) -> None:
    with pytest.raises(script.DocumentError):
        script.validate_flag_key(definitions, flag)


# --- 文書の組み立て ---


def test_first_deployment_starts_from_the_defaults(definitions: dict[str, Any]) -> None:
    document, summary = script.build_document(definitions, None, "walk_sharing", True)

    assert document["values"] == {
        "client_requirements": {"enabled": True},
        "walk_sharing": {"enabled": True},
        "route_replay": {"enabled": False},
    }
    assert document["flags"] == definitions["flags"]
    assert summary["changed"] is True
    assert summary["previous"] is None
    assert summary["next"] == "on"


def test_keeps_the_current_values_of_other_flags(definitions: dict[str, Any]) -> None:
    current, _ = script.build_document(definitions, None, "route_replay", True)
    current["values"]["client_requirements"]["ios_minimum_version"] = "1.2.0"

    document, summary = script.build_document(definitions, current, "walk_sharing", True)

    assert document["values"]["route_replay"] == {"enabled": True}
    assert document["values"]["client_requirements"] == {
        "enabled": True,
        "ios_minimum_version": "1.2.0",
    }
    assert summary["previous"] == "off"


def test_reports_no_change_when_the_value_is_already_set(definitions: dict[str, Any]) -> None:
    current, _ = script.build_document(definitions, None, "walk_sharing", True)

    _, summary = script.build_document(definitions, copy.deepcopy(current), "walk_sharing", True)

    assert summary["changed"] is False
    assert summary["previous"] == "on"


def test_drops_keys_and_attributes_removed_from_the_definitions(
    definitions: dict[str, Any],
) -> None:
    current, _ = script.build_document(definitions, None, "walk_sharing", True)
    current["values"]["old_flag"] = {"enabled": True}
    current["values"]["walk_sharing"]["legacy_attribute"] = "x"

    document, summary = script.build_document(definitions, current, "walk_sharing", True)

    assert "old_flag" not in document["values"]
    assert document["values"]["walk_sharing"] == {"enabled": True}
    assert summary["dropped_keys"] == ["old_flag"]
    assert summary["changed"] is True


def test_adds_new_flags_with_their_default(definitions: dict[str, Any]) -> None:
    current, _ = script.build_document(definitions, None, "walk_sharing", True)
    del current["values"]["route_replay"]

    document, summary = script.build_document(definitions, current, "walk_sharing", True)

    assert document["values"]["route_replay"] == {"enabled": False}
    assert summary["added_keys"] == ["route_replay"]


def test_forces_client_requirements_back_on(definitions: dict[str, Any]) -> None:
    current, _ = script.build_document(definitions, None, "walk_sharing", False)
    current["values"]["client_requirements"] = {"enabled": False}

    document, _ = script.build_document(definitions, current, "walk_sharing", False)

    assert document["values"]["client_requirements"]["enabled"] is True


def test_replaces_a_malformed_current_value_with_the_default(
    definitions: dict[str, Any],
) -> None:
    current, _ = script.build_document(definitions, None, "walk_sharing", False)
    current["values"]["route_replay"] = {"enabled": "yes"}

    document, _ = script.build_document(definitions, current, "walk_sharing", False)

    assert document["values"]["route_replay"] == {"enabled": False}


def test_rejects_a_current_document_without_values(definitions: dict[str, Any]) -> None:
    with pytest.raises(script.DocumentError, match="values"):
        script.build_document(definitions, {"version": "1"}, "walk_sharing", True)


def test_does_not_mutate_the_definitions(definitions: dict[str, Any]) -> None:
    before = copy.deepcopy(definitions)

    script.build_document(definitions, None, "walk_sharing", True)

    assert definitions == before


# --- CLI ---


def test_cli_build_writes_the_document_and_prints_a_summary(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    output = tmp_path / "next.json"

    exit_code = script.main(
        ["build", "--flag", "pin_registration", "--state", "on", "--output", str(output)]
    )

    assert exit_code == 0
    assert json.loads(output.read_text())["values"]["pin_registration"] == {"enabled": True}
    assert json.loads(capsys.readouterr().out)["changed"] is True


def test_cli_validate_fails_for_an_unknown_flag(capsys: pytest.CaptureFixture[str]) -> None:
    assert script.main(["validate", "--flag", "no_such_flag"]) == 1
    assert "::error::" in capsys.readouterr().err
