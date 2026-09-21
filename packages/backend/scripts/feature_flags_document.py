"""フラグ切り替えワークフロー（`.github/workflows/feature-flags.yml`）が AppConfig に投入する
hosted configuration version の中身を組み立てる。SS-99 / ADR-008 決定6・追補 D7/D9。

- フラグの定義（キー・名前・説明・属性・既定値）の正本は `feature-flags.json`。
  キー集合は `core/feature_flags.py` の `FEATURE_FLAGS` + 予約キーと一致させる（pytest で検査）。
- フラグの現在値の正本は AppConfig（直近に配信を完了した hosted configuration version）。
  切り替えは「現在値を引き継ぎ、指定した1本だけを書き換えた文書」を新しい版として作る。

★ 標準ライブラリだけで書くこと。このスクリプトは OIDC トークンを要求できる job で動くため、
  PyPI から依存を取得しない（backend-deploy.yml が build と deploy を分けているのと同じ理由）。

使い方（packages/backend で実行）:
    python3 scripts/feature_flags_document.py validate --flag pin_registration
    python3 scripts/feature_flags_document.py build --flag pin_registration --state on \\
        [--current current.json] --output next.json
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

DEFAULT_DEFINITIONS_PATH = Path(__file__).resolve().parent.parent / "feature-flags.json"

# core/feature_flags.py の FLAG_KEY_PATTERN / RESERVED_FLAG_KEYS と同じ値
# （標準ライブラリ縛りのため import できない。一致はテストで検査する）。
FLAG_KEY_PATTERN = re.compile(r"^[a-z][a-zA-Z\d_-]{0,63}$")
CLIENT_REQUIREMENTS_KEY = "client_requirements"
RESERVED_FLAG_KEYS = frozenset({CLIENT_REQUIREMENTS_KEY})

_TOP_LEVEL_KEYS = {"version", "flags", "values"}

# AWS.AppConfig.FeatureFlags のスキーマ（flagDefinition）が許すキーと上限。承認後の
# CreateHostedConfigurationVersion で BadRequest になる前に prepare job で落とすため。
_FLAG_DEFINITION_KEYS = {
    "name",
    "description",
    "attributes",
    "_createdAt",
    "_updatedAt",
    "_deprecation",
}
_MAX_NAME_LENGTH = 64
_MAX_DESCRIPTION_LENGTH = 1024
_MAX_ATTRIBUTES = 25

# AppConfig 側がメタ情報として付けうるキー。内容が変わったかの比較からは除く。
_TIMESTAMP_KEYS = {"_createdAt", "_updatedAt"}


class DocumentError(Exception):
    """定義ファイル・現在の文書・入力のいずれかが不正。"""


def load_definitions(path: Path) -> dict[str, Any]:
    try:
        definitions = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DocumentError(f"定義ファイルを読めません: {path}: {exc}") from exc
    validate_definitions(definitions)
    return definitions


def validate_definitions(definitions: Any) -> None:
    if not isinstance(definitions, dict) or set(definitions) != _TOP_LEVEL_KEYS:
        raise DocumentError("定義ファイルのトップレベルは version / flags / values のみです")
    if definitions["version"] != "1":
        raise DocumentError('定義ファイルの version は "1" 固定です')
    flags = definitions["flags"]
    values = definitions["values"]
    if not isinstance(flags, dict) or not isinstance(values, dict):
        raise DocumentError("flags / values はオブジェクトである必要があります")
    if CLIENT_REQUIREMENTS_KEY not in flags:
        raise DocumentError(f"予約キー {CLIENT_REQUIREMENTS_KEY} が flags にありません")
    if set(values) != set(flags):
        raise DocumentError("flags と values のキー集合が一致しません")
    for key, flag in flags.items():
        if not FLAG_KEY_PATTERN.match(key):
            raise DocumentError(f"フラグキーの形式が不正です: {key!r}")
        if not isinstance(flag, dict):
            raise DocumentError(f"フラグ定義がオブジェクトではありません: {key}")
        _validate_flag_definition(key, flag)
        default = values[key]
        if not isinstance(default, dict) or not isinstance(default.get("enabled"), bool):
            raise DocumentError(f"既定値に bool の enabled がありません: {key}")
        # 既定は常に OFF（ADR-008 決定9）。client_requirements だけは常に ON（追補 D7）。
        if default["enabled"] is not (key == CLIENT_REQUIREMENTS_KEY):
            expected = "true" if key == CLIENT_REQUIREMENTS_KEY else "false"
            raise DocumentError(f"既定値の enabled は {expected} にしてください: {key}")
        unknown_attributes = set(default) - {"enabled"} - _attribute_names(flag)
        if unknown_attributes:
            raise DocumentError(
                f"定義に無い属性が既定値にあります: {key}: {sorted(unknown_attributes)}"
            )


def _validate_flag_definition(key: str, flag: dict[str, Any]) -> None:
    unknown = set(flag) - _FLAG_DEFINITION_KEYS
    if unknown:
        raise DocumentError(f"フラグ定義に使えないキーがあります: {key}: {sorted(unknown)}")
    name = flag.get("name")
    if name is not None and (
        not isinstance(name, str) or len(name) > _MAX_NAME_LENGTH or "\n" in name
    ):
        raise DocumentError(f"name は改行を含まない {_MAX_NAME_LENGTH} 文字以内の文字列です: {key}")
    description = flag.get("description")
    if description is not None and (
        not isinstance(description, str) or len(description) > _MAX_DESCRIPTION_LENGTH
    ):
        raise DocumentError(f"description は {_MAX_DESCRIPTION_LENGTH} 文字以内の文字列です: {key}")
    attributes = flag.get("attributes", {})
    if not isinstance(attributes, dict) or len(attributes) > _MAX_ATTRIBUTES:
        raise DocumentError(f"attributes は {_MAX_ATTRIBUTES} 個以内のオブジェクトです: {key}")
    for attribute in attributes:
        if not FLAG_KEY_PATTERN.match(attribute):
            raise DocumentError(f"属性名の形式が不正です: {key}.{attribute}")


def validate_flag_key(definitions: dict[str, Any], flag: str) -> None:
    if not FLAG_KEY_PATTERN.match(flag):
        raise DocumentError(f"フラグキーの形式が不正です: {flag!r}")
    if flag in RESERVED_FLAG_KEYS:
        raise DocumentError(f"{flag} は予約キーのため切り替えられません（常に ON に保つ）")
    if flag not in definitions["flags"]:
        known = ", ".join(sorted(set(definitions["flags"]) - RESERVED_FLAG_KEYS))
        raise DocumentError(f"定義ファイルに無いフラグです: {flag}（定義済み: {known}）")


def build_document(
    definitions: dict[str, Any],
    current: dict[str, Any] | None,
    flag: str,
    enabled: bool,
    *,
    prune: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """新しい版の文書と、変更内容の要約を返す。

    - `current` は直近に配信を完了した版（未配信なら None）。その `values` を引き継ぐ。
    - 定義ファイルにあって現在値に無いキーは既定値（OFF）で足す。
    - 定義ファイルに無いキーは、既定では定義ごと**そのまま残す**。`prune=True` のときだけ落とす。
      main が稼働中の backend より先行している（フラグ削除 PR はマージ済みだが未デプロイ）場合や、
      dev で古い ref から起動した場合に、ON のフラグを黙って消さないため。
    - 定義に無い属性は落とす。`_` で始まる AppConfig の予約フィールド（`_variants` 等）は残す。
    - `client_requirements` は常に ON に戻す。
    """
    validate_flag_key(definitions, flag)
    current_values = _current_values(current)
    current_flags = current.get("flags", {}) if current is not None else {}

    flags: dict[str, Any] = dict(definitions["flags"])
    values: dict[str, Any] = {}
    for key, flag_definition in definitions["flags"].items():
        default = definitions["values"][key]
        base = current_values.get(key)
        if not isinstance(base, dict) or not isinstance(base.get("enabled"), bool):
            base = default
        allowed = {"enabled"} | _attribute_names(flag_definition)
        values[key] = {
            name: value for name, value in base.items() if name in allowed or name.startswith("_")
        }
    values[CLIENT_REQUIREMENTS_KEY]["enabled"] = True
    values[flag]["enabled"] = enabled

    undefined_keys = sorted(set(current_values) - set(definitions["flags"]))
    kept_keys: list[str] = []
    if not prune:
        for key in undefined_keys:
            if isinstance(current_flags, dict) and isinstance(current_flags.get(key), dict):
                flags[key] = current_flags[key]
                values[key] = current_values[key]
                kept_keys.append(key)

    document = {"version": "1", "flags": flags, "values": values}
    previous = current_values.get(flag)
    previous_enabled = previous.get("enabled") if isinstance(previous, dict) else None
    summary = {
        "changed": current is None or _comparable(document) != _comparable(current),
        "flag": flag,
        "previous": _state_label(previous_enabled),
        "next": _state_label(enabled),
        "dropped_keys": [key for key in undefined_keys if key not in kept_keys],
        "kept_undefined_keys": kept_keys,
        "added_keys": sorted(set(definitions["flags"]) - set(current_values))
        if current is not None
        else [],
    }
    return document, summary


def _comparable(document: Any) -> Any:
    """`_createdAt` / `_updatedAt` を除いた比較用の写し。"""
    if isinstance(document, dict):
        return {k: _comparable(v) for k, v in document.items() if k not in _TIMESTAMP_KEYS}
    if isinstance(document, list):
        return [_comparable(v) for v in document]
    return document


def _current_values(current: dict[str, Any] | None) -> dict[str, Any]:
    if current is None:
        return {}
    if not isinstance(current, dict) or not isinstance(current.get("values"), dict):
        raise DocumentError("現在配信中の文書に values がありません（FeatureFlags 形式ではない）")
    return current["values"]


def _attribute_names(flag_definition: dict[str, Any]) -> set[str]:
    attributes = flag_definition.get("attributes")
    return set(attributes) if isinstance(attributes, dict) else set()


def _state_label(enabled: object) -> str | None:
    if isinstance(enabled, bool):
        return "on" if enabled else "off"
    return None


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate = subparsers.add_parser("validate", help="定義ファイルとフラグ名を検査する")
    validate.add_argument("--definitions", type=Path, default=DEFAULT_DEFINITIONS_PATH)
    validate.add_argument("--flag", required=True)

    build = subparsers.add_parser("build", help="投入する文書を組み立てる")
    build.add_argument("--definitions", type=Path, default=DEFAULT_DEFINITIONS_PATH)
    build.add_argument("--flag", required=True)
    build.add_argument("--state", choices=["on", "off"], required=True)
    build.add_argument("--current", type=Path, help="直近に配信を完了した版（未配信なら省略）")
    build.add_argument("--output", type=Path, required=True)
    build.add_argument(
        "--prune",
        action="store_true",
        help="定義ファイルに無いキーを AppConfig から削除する（既定は残す）",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = _parse_args(argv)
    try:
        definitions = load_definitions(args.definitions)
        if args.command == "validate":
            validate_flag_key(definitions, args.flag)
            return 0

        current = None
        if args.current is not None:
            try:
                current = json.loads(args.current.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                raise DocumentError(f"現在配信中の文書を読めません: {exc}") from exc
        document, summary = build_document(
            definitions, current, args.flag, args.state == "on", prune=args.prune
        )
    except DocumentError as exc:
        print(f"::error::{exc}", file=sys.stderr)
        return 1

    args.output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
