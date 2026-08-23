#!/usr/bin/env python3
"""agent-memory の陳腐化を機械的に検出する。

メモリは書いた時点では正しくても、コードの移動・削除で黙って嘘になる。
「更新漏れたメモリが後続のエージェントを誤動作させる」のを防ぐため、
本文が言及するファイルパスの実在と、`verify_by` の期限を確認する。

判定できるのは「参照先がまだ存在するか」だけで、内容の正しさは分からない。
検出結果は棚卸し（knowledge-review skill）で人間・エージェントが再検証する材料として使う。

使い方:
    scripts/knowledge/check-memory-staleness.py                # 全メモリを検査
    scripts/knowledge/check-memory-staleness.py --agent mobile-developer
    scripts/knowledge/check-memory-staleness.py --json
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

MEMORY_ROOT = Path(".claude/agent-memory")

# バッククォートで囲まれた、拡張子付きのパスらしき文字列。
CODE_SPAN = re.compile(r"`([^`\n]+)`")
PATH_LIKE = re.compile(r"^[\w./@-]+\.(ts|tsx|js|jsx|py|md|json|ya?ml|sh|sql|toml|lock)$")

# 実在確認の対象外。汎用的な設定ファイル名や、リポジトリ外のものを指す表記。
IGNORED = {
    "package.json",
    "tsconfig.json",
    "pnpm-lock.yaml",
    ".env",
    ".env.example",
    "README.md",
}

# 実在するパスではなく「書き方の型」を示している表記。実在確認しても意味がない。
PLACEHOLDER = re.compile(r"xxx|\*|<|>|\{|\}")


def is_placeholder(token: str) -> bool:
    if PLACEHOLDER.search(token):
        return True
    # `.test.ts` のような、拡張子だけを指す省略表記
    return token.startswith(".") and "/" not in token


def repo_root() -> Path:
    out = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=True,
    )
    return Path(out.stdout.strip())


def tracked_files(root: Path) -> tuple[set[str], set[str]]:
    out = subprocess.run(
        ["git", "ls-files"], capture_output=True, text=True, check=True, cwd=root
    )
    paths = {line for line in out.stdout.splitlines() if line}
    basenames = {p.rsplit("/", 1)[-1] for p in paths}
    return paths, basenames


def resolves(token: str, paths: set[str], basenames: set[str], root: Path) -> bool:
    if token in paths or (root / token).exists():
        return True
    if "/" in token:
        suffix = "/" + token
        return any(p.endswith(suffix) for p in paths)
    return token in basenames


def front_matter_value(text: str, key: str) -> str:
    match = re.search(rf"^\s*{re.escape(key)}:\s*(.+)$", text[: text.find("\n---", 3)], re.M)
    return match.group(1).strip() if match else ""


def check_file(path: Path, root: Path, paths: set[str], basenames: set[str]) -> dict:
    text = path.read_text(encoding="utf-8")
    issues: list[str] = []

    missing: list[str] = []
    for span in CODE_SPAN.findall(text):
        token = span.strip()
        if token in IGNORED or not PATH_LIKE.match(token):
            continue
        if is_placeholder(token):
            continue
        # tmp/ は check-tmp-references.sh の担当なのでここでは扱わない。
        if "tmp/" in token:
            continue
        if not resolves(token, paths, basenames, root) and token not in missing:
            missing.append(token)

    if missing:
        issues.append("参照先が存在しない: " + ", ".join(f"`{m}`" for m in missing))

    verify_by = front_matter_value(text, "verify_by")
    if verify_by:
        try:
            due = dt.date.fromisoformat(verify_by)
            if due < dt.date.today():
                issues.append(f"`verify_by: {verify_by}` を過ぎている（再検証が必要）")
        except ValueError:
            pass  # 形式エラーは check-memory-frontmatter.py の担当

    return {
        "file": str(path.relative_to(root)),
        "agent": path.parent.name,
        "missing_paths": missing,
        "issues": issues,
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent", help="特定エージェントに絞る")
    parser.add_argument("--json", action="store_true", help="JSONで出力する")
    args = parser.parse_args(argv)

    root = repo_root()
    paths, basenames = tracked_files(root)

    results = []
    for path in sorted((root / MEMORY_ROOT).rglob("*.md")):
        if path.name == "MEMORY.md":
            continue
        if args.agent and path.parent.name != args.agent:
            continue
        result = check_file(path, root, paths, basenames)
        if result["issues"]:
            results.append(result)

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return 0

    if not results:
        print("✅ 陳腐化の兆候は見つかりませんでした。")
        return 0

    print(f"# 陳腐化の疑いがあるメモリ（{len(results)} 件）\n")
    print("参照先が消えている＝内容が古い可能性が高い、というだけの判定です。")
    print("再検証のうえ、更新・削除・そのまま維持のいずれかを判断してください。\n")
    print("誤検知しやすいもの: コード生成物や .gitignore 対象のファイル")
    print("（`src/api/generated/**`、`.expo/types/**` など）は、生成前だと存在しないため")
    print("検出されます。生成コマンドを実行すれば解消するものは陳腐化ではありません。\n")

    for result in results:
        print(f"- {result['file']}")
        for issue in result["issues"]:
            print(f"    {issue}")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
