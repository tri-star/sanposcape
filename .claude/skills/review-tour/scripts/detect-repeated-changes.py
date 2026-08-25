#!/usr/bin/env python3
"""同型の変更(横展開)を検出し、代表1件+残りの一覧にまとめる。

「全ルーターに同じデコレータを付けた」「同じ import を12ファイルに足した」
といった変更は、1件を精読すれば残りは読まなくてよい。
これを人手で見分けるのは面倒なので、diff の hunk を正規化して
(識別子・数値・文字列をプレースホルダに置換して)ハッシュが一致するものを束ねる。

出力は「章立ての候補」であって断定ではない。最終的な束ね方は
実際の diff を見て判断すること。

使い方:
    python3 .claude/skills/review-tour/scripts/detect-repeated-changes.py 123
    python3 .claude/skills/review-tour/scripts/detect-repeated-changes.py --local
    python3 .claude/skills/review-tour/scripts/detect-repeated-changes.py 123 --min-count 4
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys

# 生成物・ロックファイルは同型変更の塊になりやすく、検出しても意味がない。
SKIP_PATTERNS = [
    r"^packages/mobile/src/api/",
    r"(^|/)(pnpm-lock\.yaml|uv\.lock)$",
    r"^packages/backend/openapi\.(json|ya?ml)$",
]

STRING_RE = re.compile(r"""(".*?"|'.*?')""")
NUMBER_RE = re.compile(r"\b\d+(\.\d+)?\b")
WORD_RE = re.compile(r"\b[A-Za-z_][A-Za-z0-9_]*\b")


def run(cmd: list[str]) -> str:
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    except FileNotFoundError:
        sys.exit(f"error: コマンドが見つかりません: {cmd[0]}")
    except subprocess.CalledProcessError as exc:
        sys.exit(f"error: {' '.join(cmd)} が失敗しました\n{exc.stderr.strip()}")
    return result.stdout


def normalize(line: str) -> str:
    """変更行から「構造」だけを残す。識別子の違いを無視して形を比べるため。"""
    sign, body = line[0], line[1:]
    body = STRING_RE.sub("S", body)
    body = NUMBER_RE.sub("N", body)
    body = WORD_RE.sub("W", body)
    body = re.sub(r"\s+", " ", body).strip()
    return f"{sign}{body}"


def parse_hunks(diff_text: str):
    """unified diff を (path, hunk_header, start_line, changed_lines) に分解する。"""
    hunks = []
    path = None
    header = None
    start_line = 0
    changed: list[str] = []

    def flush():
        if path and changed:
            hunks.append(
                {
                    "path": path,
                    "header": header,
                    "line": start_line,
                    "changed": list(changed),
                }
            )

    for line in diff_text.splitlines():
        if line.startswith("diff --git "):
            flush()
            changed = []
            path = None
            header = None
        elif line.startswith("+++ b/"):
            path = line[6:]
        elif line.startswith("@@"):
            flush()
            changed = []
            header = line
            m = re.search(r"\+(\d+)", line)
            start_line = int(m.group(1)) if m else 0
        elif header is not None and line[:1] in ("+", "-") and not line.startswith(("+++", "---")):
            changed.append(line)

    flush()
    return hunks


def main() -> None:
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)

    min_count = 3
    if "--min-count" in args:
        i = args.index("--min-count")
        min_count = int(args[i + 1])
        args = args[:i] + args[i + 2 :]

    os.chdir(run(["git", "rev-parse", "--show-toplevel"]).strip())

    if args[0] == "--local":
        base = args[1] if len(args) > 1 else "main"
        merge_base = run(["git", "merge-base", base, "HEAD"]).strip()
        diff_text = run(["git", "diff", merge_base, "HEAD"])
    else:
        diff_text = run(["gh", "pr", "diff", args[0]])

    groups: dict[str, dict] = {}
    for hunk in parse_hunks(diff_text):
        if any(re.search(p, hunk["path"]) for p in SKIP_PATTERNS):
            continue
        normalized = [normalize(line) for line in hunk["changed"]]
        normalized = [line for line in normalized if line not in ("+", "-")]
        if not normalized:
            continue
        key = hashlib.sha1("\n".join(normalized).encode()).hexdigest()[:12]
        group = groups.setdefault(
            key,
            {
                "key": key,
                "changed_lines": len(normalized),
                "sample": hunk["changed"][:8],
                "occurrences": [],
            },
        )
        group["occurrences"].append({"path": hunk["path"], "line": hunk["line"]})

    def qualifies(group: dict) -> bool:
        count = len(group["occurrences"])
        if count < min_count:
            return False
        if group["changed_lines"] >= 2:
            return True
        # 1行だけの変更(import追加など)は形が一致しやすくノイズになる。
        # 多数のファイルに適用されている場合だけ「横展開」として扱う。
        return count >= 5

    repeated = [g for g in groups.values() if qualifies(g)]
    repeated.sort(key=lambda g: -len(g["occurrences"]))

    for group in repeated:
        group["count"] = len(group["occurrences"])
        group["representative"] = group["occurrences"][0]
        group["others"] = group["occurrences"][1:]
        del group["occurrences"]

    covered = sorted({o["path"] for g in repeated for o in [g["representative"], *g["others"]]})

    output = {
        "min_count": min_count,
        "repeated_groups": repeated,
        "covered_files": covered,
        "hint": (
            "representative の1件だけ精読し、others は「同型の変更が N 件」とまとめて提示する。"
            "ただし others の中に例外的な差分が紛れていないか、ファイル名だけは必ず読み上げること。"
        ),
    }
    json.dump(output, sys.stdout, ensure_ascii=False, indent=2)
    print()


if __name__ == "__main__":
    main()
