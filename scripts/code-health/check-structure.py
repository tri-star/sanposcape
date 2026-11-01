#!/usr/bin/env python3
"""コードの構造（フォルダのファイル数・接頭辞の集中・ファイルの行数）を検査する。

可読性が落ちている兆候を機械的に止める（ADR-016）。分け方の判断（どこで切るか）はしない。

測るもの（kind）:
- file-lines   : ファイルの行数。実装とテストで閾値を分ける
- folder-files : フォルダ直下の実装ファイルの数（テストは分けて数え、表示だけ）
- prefix       : 同じフォルダの実装ファイルのうち、名前の最初の語が同じものの数（サブフォルダに分ける候補）

対象は git の管理下（追跡中と、無視されていない未追跡）の `packages/`・`scripts/` のソース。生成物は除く。

既存の違反はベースライン（structure-baseline.json）に値つきで載せて据え置き、新しい違反と悪化だけを止める（ラチェット方式）。
ベースラインの各項目には、片付ける課題（`issue`）と理由（`reason`）を必ず書く。欠けていれば失敗にする。

使い方:
    scripts/code-health/check-structure.py              # 検査（新しい違反・悪化・ベースラインの不備があれば exit 1）
    scripts/code-health/check-structure.py --all        # ベースラインに載った違反と警告もすべて表示
    scripts/code-health/check-structure.py --baseline   # ベースラインを今の値で再生成（既存の issue・reason は引き継ぐ）
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

BASELINE = Path("scripts/code-health/structure-baseline.json")

# ---- 閾値（値と理由は ADR-016。下げるときは ADR に追補する） ----
# ファイルの行数: (警告, 失敗)。失敗は「この値を超えたら」。警告は表示だけで CI は落とさない。
LINE_LIMITS = {
    "impl": (500, 800),
    "test": (1000, 1500),
}
# フォルダ直下の実装ファイル数の上限（これを超えたら失敗）。
FOLDER_FILES_MAX = 20
# 同じ接頭辞の実装ファイルの数の上限（これを超えたら失敗。8 以上で分ける候補）。
PREFIX_FILES_MAX = 7

# ---- 対象 ----
SOURCE_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".astro"}
TARGET_ROOTS = ("packages/", "scripts/")
# 生成物。どの検査の対象にもしない。
GENERATED_PREFIXES = ("packages/mobile/src/api/generated/",)
# 増えていくのが性質のフォルダ。ファイル数と接頭辞の検査だけ対象にしない（行数は測る）。
FOLDER_CHECK_EXCLUDED = ("packages/backend/alembic/versions",)
# フォルダの中身として数えない、構造のためだけのファイル。
STRUCTURAL_FILES = {"__init__.py"}
# 接頭辞として数えない、慣習で付く最初の語（`usePinEdit` は `pin` として数える）。
CONVENTIONAL_FIRST_WORDS = {"use", "test"}

# この名前のフォルダの下はテスト（テストの支え・mock を含む）。
TEST_DIRS = {"tests", "__tests__", "test", "__mocks__"}

ISSUE_RE = re.compile(r"^SS-\d+$")

# 失敗したときの案内。分割を判断する skill ができたら、ここに名前を足す（ADR-016）。
SPLIT_GUIDE = (
    "分け方を決めて分割してください（フォルダはまとまりごとのサブフォルダへ、ファイルは責務ごとに）。\n"
    "今は分けられない理由があるなら、--baseline で載せ、`issue`（片付ける課題）と `reason` を書いてください（ADR-016）。"
)


@dataclass(frozen=True)
class Finding:
    kind: str
    path: str
    value: int
    limit: int
    prefix: str | None = None
    detail: str = ""

    @property
    def key(self) -> tuple[str, str, str | None]:
        return (self.kind, self.path, self.prefix)

    def describe(self) -> str:
        if self.kind == "file-lines":
            return f"{self.path}: {self.value} 行（{self.detail}の閾値 {self.limit} を超えた）"
        if self.kind == "folder-files":
            return f"{self.path}/: 実装ファイル {self.value} 個（閾値 {self.limit} を超えた{self.detail}）"
        return f"{self.path}/: 接頭辞 `{self.prefix}` のファイル {self.value} 個（閾値 {self.limit} を超えた{self.detail}）"


def is_test(path: str) -> bool:
    p = PurePosixPath(path)
    # `test/` は mobile の vitest の setup と mock（`packages/mobile/src/test/`）。
    if any(part in TEST_DIRS for part in p.parts[:-1]):
        return True
    name = p.name
    if name == "conftest.py" or (name.startswith("test_") and name.endswith(".py")) or name.endswith("_test.py"):
        return True
    return bool(re.search(r"\.(test|spec)\.[A-Za-z]+$", name))


def is_target(path: str) -> bool:
    parts = PurePosixPath(path).parts
    # package の docs/ にはデザインのモックの JS など、アプリのコードでないものが入る。
    in_package_docs = len(parts) > 3 and parts[0] == "packages" and parts[2] == "docs"
    return (
        path.startswith(TARGET_ROOTS)
        and PurePosixPath(path).suffix in SOURCE_EXTENSIONS
        and not path.startswith(GENERATED_PREFIXES)
        and not in_package_docs
    )


def split_words(name: str) -> list[str]:
    """名前を小文字の語に分ける。camelCase・PascalCase・snake_case・kebab-case を扱う。"""
    words: list[str] = []
    for chunk in re.split(r"[_\-]+", name):
        words += [w.lower() for w in re.findall(r"[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+", chunk)]
    return words


def first_word(filename: str, folder: str = "") -> str | None:
    """ファイル名の最初の語（接頭辞）を返す。

    慣習で付く語（`use` など）は飛ばす。最初の語が親フォルダの名前の語と同じとき（`features/pin/lib/pinEditDraft.ts` の `pin`）は、
    フォルダで既に分かれている語なので次の語（`edit`）で数える。機能名を名前に含める命名規約のフォルダが、それだけで候補にならないようにする。
    """
    words = split_words(filename.split(".", 1)[0])
    while words and words[0] in CONVENTIONAL_FIRST_WORDS:
        words.pop(0)
    folder_words = {w for part in PurePosixPath(folder).parts for w in split_words(part)}
    if len(words) > 1 and words[0] in folder_words:
        words.pop(0)
    return words[0] if words else None


def count_lines(path: Path) -> int | None:
    try:
        return len(path.read_bytes().splitlines())
    except OSError:
        return None


def scan(root: Path, files: list[str]) -> tuple[list[Finding], list[Finding]]:
    """違反（失敗の閾値を超えたもの）と警告（警告の閾値を超えたが失敗の閾値以下のもの）を返す。"""
    violations: list[Finding] = []
    warnings: list[Finding] = []
    impl_by_folder: dict[str, list[str]] = defaultdict(list)
    tests_by_folder: dict[str, int] = defaultdict(int)

    for path in sorted(f for f in files if is_target(f)):
        test = is_test(path)
        lines = count_lines(root / path)
        if lines is not None:
            warn, fail = LINE_LIMITS["test" if test else "impl"]
            label = "テスト" if test else "実装"
            if lines > fail:
                violations.append(Finding("file-lines", path, lines, fail, detail=label))
            elif lines > warn:
                warnings.append(Finding("file-lines", path, lines, warn, detail=f"{label}の警告"))

        folder = str(PurePosixPath(path).parent)
        name = PurePosixPath(path).name
        if folder.startswith(FOLDER_CHECK_EXCLUDED) or name in STRUCTURAL_FILES:
            continue
        if test:
            tests_by_folder[folder] += 1
        else:
            impl_by_folder[folder].append(name)

    for folder, names in sorted(impl_by_folder.items()):
        if len(names) > FOLDER_FILES_MAX:
            detail = f"、ほかにテスト {tests_by_folder[folder]} 個" if tests_by_folder[folder] else ""
            violations.append(Finding("folder-files", folder, len(names), FOLDER_FILES_MAX, detail=detail))
        by_prefix: dict[str, list[str]] = defaultdict(list)
        for name in names:
            word = first_word(name, folder)
            if word:
                by_prefix[word].append(name)
        for prefix, members in sorted(by_prefix.items()):
            if len(members) > PREFIX_FILES_MAX:
                example = "、例: " + ", ".join(members[:3])
                violations.append(Finding("prefix", folder, len(members), PREFIX_FILES_MAX, prefix=prefix, detail=example))
    return violations, warnings


# ---- ベースライン ----

def entry_key(entry: dict) -> tuple[str, str, str | None]:
    return (entry.get("kind", ""), entry.get("path", ""), entry.get("prefix"))


def load_baseline(path: Path) -> list[dict]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return list(data.get("entries", []))


def validate_baseline(entries: list[dict]) -> list[str]:
    """ベースラインの不備（課題・理由の欠け、値の欠け、重複）を返す。"""
    problems: list[str] = []
    seen: set[tuple[str, str, str | None]] = set()
    for entry in entries:
        key = entry_key(entry)
        label = f"{key[0]} {key[1]}" + (f" `{key[2]}`" if key[2] else "")
        if key[0] not in {"file-lines", "folder-files", "prefix"} or not key[1]:
            problems.append(f"{label}: kind・path が正しくない")
        if key[0] == "prefix" and not key[2]:
            problems.append(f"{label}: prefix が無い")
        if not isinstance(entry.get("value"), int):
            problems.append(f"{label}: value（載せたときの値）が無い")
        if not ISSUE_RE.match(str(entry.get("issue") or "")):
            problems.append(f"{label}: issue（片付ける課題。SS-123 の形）が無い")
        if not str(entry.get("reason") or "").strip():
            problems.append(f"{label}: reason（今は分けない理由）が無い")
        if key in seen:
            problems.append(f"{label}: 重複している")
        seen.add(key)
    return problems


@dataclass
class Comparison:
    new: list[Finding]
    worsened: list[tuple[Finding, int]]
    lowerable: list[tuple[Finding, int]]
    resolved: list[dict]
    known: list[Finding]


def compare(violations: list[Finding], entries: list[dict]) -> Comparison:
    baseline = {entry_key(e): e for e in entries}
    result = Comparison([], [], [], [], [])
    current = set()
    for finding in violations:
        current.add(finding.key)
        entry = baseline.get(finding.key)
        if entry is None:
            result.new.append(finding)
            continue
        recorded = entry.get("value")
        if not isinstance(recorded, int):
            result.new.append(finding)  # 値の無い項目は validate_baseline が落とす。ここでは据え置かない
        elif finding.value > recorded:
            result.worsened.append((finding, recorded))
        elif finding.value < recorded:
            result.lowerable.append((finding, recorded))
        else:
            result.known.append(finding)
    result.resolved = [e for key, e in baseline.items() if key not in current]
    return result


def write_baseline(path: Path, violations: list[Finding], previous: list[dict]) -> int:
    old = {entry_key(e): e for e in previous}
    entries = []
    for finding in sorted(violations, key=lambda f: (f.kind, f.path, f.prefix or "")):
        entry: dict = {"kind": finding.kind, "path": finding.path}
        if finding.prefix:
            entry["prefix"] = finding.prefix
        entry["value"] = finding.value
        entry["issue"] = old.get(finding.key, {}).get("issue", "")
        entry["reason"] = old.get(finding.key, {}).get("reason", "")
        entries.append(entry)
    data = {
        "description": (
            "コードの構造の既知の違反（ADR-016）。value を超えると CI が失敗する。"
            "issue は片付ける課題、reason は今は分けない理由で、どちらも必須。"
            "再生成: scripts/code-health/check-structure.py --baseline"
        ),
        "entries": entries,
    }
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return len(entries)


# ---- 実行 ----

def repo_root() -> Path:
    out = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True)
    return Path(out.stdout.strip())


def repo_files(root: Path) -> list[str]:
    out = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        capture_output=True, text=True, check=True, cwd=root,
    )
    # 削除してまだコミットしていないファイルは --cached に残るので、実在するものだけにする。
    return [f for f in out.stdout.splitlines() if (root / f).is_file()]


def annotate(level: str, finding: Finding, message: str) -> None:
    """GitHub Actions ではファイルに注釈を付ける。"""
    if os.environ.get("GITHUB_ACTIONS") == "true":
        # フォルダはファイルではないので、注釈の位置を付けない（ジョブの概要にだけ出る）。
        props = f" file={finding.path}" if finding.kind == "file-lines" else ""
        print(f"::{level}{props}::{message}")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--baseline", action="store_true", help="ベースラインを今の値で再生成する")
    parser.add_argument("--all", action="store_true", help="ベースラインに載った違反と警告もすべて表示する")
    args = parser.parse_args(argv)

    root = repo_root()
    violations, warnings = scan(root, repo_files(root))
    entries = load_baseline(root / BASELINE)

    if args.baseline:
        count = write_baseline(root / BASELINE, violations, entries)
        missing = validate_baseline(load_baseline(root / BASELINE))
        print(f"ベースラインを再生成しました: {count} 件")
        if missing:
            print("issue・reason が空の項目があります。埋めないと検査が失敗します:")
            for problem in missing:
                print(f"  {problem}")
        return 0

    if args.all:
        print("違反（ベースラインに載ったものを含む）:")
        for finding in violations:
            print(f"  {finding.describe()}")
        print("警告（表示だけ）:")
        for finding in warnings:
            print(f"  {finding.describe()}")
        print(f"\n違反 {len(violations)} 件、警告 {len(warnings)} 件（ベースライン {len(entries)} 件）")
        return 0

    result = compare(violations, entries)
    problems = validate_baseline(entries)

    failed = bool(result.new or result.worsened or problems)
    if result.new:
        print("❌ 新しい構造の違反（ベースラインに無い）:")
        for finding in result.new:
            print(f"  {finding.describe()}")
            annotate("error", finding, f"新しい構造の違反: {finding.describe()}")
    if result.worsened:
        print("❌ ベースラインより悪化した構造の違反:")
        for finding, recorded in result.worsened:
            print(f"  {finding.describe()} — ベースラインは {recorded}")
            annotate("error", finding, f"ベースライン {recorded} より悪化: {finding.describe()}")
    if problems:
        print("❌ ベースラインの不備:")
        for problem in problems:
            print(f"  {problem}")
    if result.new or result.worsened:
        print()
        print(SPLIT_GUIDE)

    if warnings:
        # 警告は注釈にしない。どの PR にも同じものが並んでノイズになり、注釈の件数の上限にも当たるため。
        print(f"\n⚠️ 警告 {len(warnings)} 件（失敗にはしない。次に分ける候補）:")
        for finding in warnings:
            print(f"  {finding.describe()}")
    if result.lowerable or result.resolved:
        print("\nℹ️ ベースラインを下げられる・外せる項目があります（--baseline で更新できます）:")
        for finding, recorded in result.lowerable:
            print(f"  {finding.describe()} — ベースラインは {recorded}")
        for entry in result.resolved:
            label = entry.get("path", "") + (f" `{entry['prefix']}`" if entry.get("prefix") else "")
            print(f"  {entry.get('kind')} {label}: 閾値以下になった")

    if failed:
        return 1
    print(f"\n✅ 構造に新しい違反・悪化はありません（ベースラインの既知の違反: {len(result.known) + len(result.lowerable)} 件）")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
