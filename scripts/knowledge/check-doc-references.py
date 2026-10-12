#!/usr/bin/env python3
"""文書中のリンク・ファイルパス・pnpm script が実在するかを検査する。

文書の乖離のうち、名前やパスのずれを機械的に止める（ADR-014 決定5 の3段目）。
レビュアーと違い、途中で検査を打ち切らない。意味の乖離（記述が動作と合っているか）は
change-review の doc-maintainer が見る。

検査すること:
- link    : Markdown の相対リンク `[text](path)` の行き先が実在するか
- path    : インラインコード中のファイルパス（`packages/...`・`./docs/...` など）が実在するか
- pnpm    : `pnpm --filter <package> <script>` の package と script が package.json にあるか

既存の違反はベースラインに載せて据え置き、新しい違反だけを止める（他の検査と同じ方式）。
例外は該当行に `doc-ref-ok` を含むコメントを添える。
  例: <!-- doc-ref-ok: 削除済みのファイルを経緯として挙げている -->

使い方:
    scripts/knowledge/check-doc-references.py              # 検査（新しい違反があれば exit 1）
    scripts/knowledge/check-doc-references.py --all        # ベースラインも含めて全違反を表示
    scripts/knowledge/check-doc-references.py --baseline   # ベースラインを再生成
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

BASELINE = Path("scripts/knowledge/doc-reference-baseline.txt")

# 検査対象の文書（git 管理下の .md）。agent-memory は check-memory-staleness.py が見るので含めない。
SCAN_PATTERNS = [
    re.compile(r"^[^/]+\.md$"),
    re.compile(r"^docs/.+\.md$"),
    re.compile(r"^packages/[^/]+/(AGENTS|README)\.md$"),
    re.compile(r"^packages/[^/]+/(docs|adr)/.+\.md$"),
    re.compile(r"^\.claude/(skills|agents)/.+\.md$"),
]

# 存在しないパスを意図して書いている文書。検査しない。
IGNORED_FILES = {
    # 旧 frontend-* の内容を React 前提のまま残した参照資料。packages/frontend などは存在しないと冒頭で断っている（ADR-014 決定7）。
    ".claude/skills/change-review/references/web-frontend.md",
    ".claude/skills/task-workflow/references/web-frontend.md",
}
IGNORED_PREFIXES = (
    # launch-project が新しいプロジェクトへコピーする雛形。コピー先での相対パスで書かれている。
    ".claude/skills/launch-project/assets/",
)

# インラインコードのうち、リポジトリのパスとして検査するものの先頭。
PATH_PREFIXES = ("packages/", "docs/", "scripts/", ".claude/", ".github/", ".agents/", ".codex/", "./", "../")

# 生成物・gitignore 対象など、文書が「作られる場所」として書くパス。実在しなくてよい。
GENERATED_PARTS = (
    "/src/api/generated",
    "/.expo",
    "/node_modules",
    "/dist",
    "/.aws-sam",
    "/android/",
    "/ios/",
    "tmp/",
    ".claude/memory-access-log/",
)

# pnpm の組み込みコマンド（package.json の script ではないもの）。
PNPM_BUILTINS = {
    "add", "install", "i", "remove", "rm", "update", "up", "exec", "dlx", "why",
    "list", "ls", "outdated", "audit", "run", "test", "start", "store", "rebuild",
}

LINK_RE = re.compile(r"(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
CODE_RE = re.compile(r"`([^`\n]+)`")
PNPM_RE = re.compile(r"pnpm\s+(?:--filter|-F)\s+([A-Za-z0-9@/_.-]+)\s+([A-Za-z0-9:_.-]+)(?:\s+([A-Za-z0-9:_.-]+))?")


def repo_root() -> Path:
    out = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True)
    return Path(out.stdout.strip())


def target_files(root: Path) -> list[str]:
    out = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "*.md"],
        capture_output=True, text=True, check=True, cwd=root,
    )
    return sorted(
        f for f in out.stdout.splitlines()
        if any(p.match(f) for p in SCAN_PATTERNS) and f not in IGNORED_FILES and not f.startswith(IGNORED_PREFIXES)
    )


def pnpm_scripts(root: Path) -> dict[str, set[str]]:
    packages: dict[str, set[str]] = {}
    for manifest in [root / "package.json", *sorted(root.glob("packages/*/package.json"))]:
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if data.get("name"):
            packages[data["name"]] = set(data.get("scripts", {}))
    return packages


def looks_like_placeholder(value: str) -> bool:
    return any(ch in value for ch in "<>*?{}$|…") or "..." in value or "XXX" in value or "YYYY" in value


def _found(candidate: Path) -> bool:
    try:
        candidate = candidate.resolve()
    except OSError:
        return False
    if candidate.exists():
        return True
    # `ADR-M-003` のように、ファイル名の先頭（番号）だけで参照する書き方を許す。
    return candidate.parent.is_dir() and any(candidate.parent.glob(candidate.name + "*"))


def link_exists(base: Path, value: str) -> bool:
    """Markdown のリンクは、その文書のディレクトリからの相対パス。"""
    value = value.split("#", 1)[0].split("?", 1)[0]
    return not value or _found(base / value)


def path_exists(root: Path, rel: str, base: Path, value: str) -> bool:
    """インラインコードのパスは、書き方がまちまちなので複数の起点を試す。

    ./ や ../ で始まればその文書から。そうでなければリポジトリのルート、文書が属する package のルート、文書のディレクトリの順。
    """
    value = value.split("#", 1)[0].rstrip(":,.")
    value = re.sub(r":\d+(-\d+)?$", "", value)  # file.py:34 のような行番号付きの参照
    if not value:
        return True
    if value.startswith(("./", "../")):
        return _found(base / value)
    starts = [root]
    parts = Path(rel).parts
    if len(parts) > 2 and parts[0] == "packages":
        starts.append(root / parts[0] / parts[1])
    starts.append(base)
    return any(_found(start / value) for start in starts)


def is_generated(value: str) -> bool:
    return any(part in f"/{value}" for part in GENERATED_PARTS)


def scan(root: Path) -> list[str]:
    scripts = pnpm_scripts(root)
    violations: list[str] = []
    for rel in target_files(root):
        path = root / rel
        base = path.parent
        in_fence = False
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeDecodeError):
            continue
        for number, line in enumerate(lines, start=1):
            stripped = line.lstrip()
            if stripped.startswith("```") or stripped.startswith("~~~"):
                in_fence = not in_fence
            if "doc-ref-ok" in line:
                continue

            # pnpm はコードブロックの中も検査する（コマンド例はコードブロックに書かれることが多い）。
            for match in PNPM_RE.finditer(line):
                package, script, after = match.group(1), match.group(2), match.group(3)
                if looks_like_placeholder(package) or looks_like_placeholder(script):
                    continue
                if script == "run" and after:
                    script = after
                if script in PNPM_BUILTINS:
                    continue
                if package not in scripts:
                    violations.append(f"{rel}:{number}: pnpm: package `{package}` が無い")
                elif script not in scripts[package]:
                    violations.append(f"{rel}:{number}: pnpm: `{package}` に script `{script}` が無い")

            if in_fence:
                continue

            # インラインコードの中の [text](path) は書式の例なので、リンクとして扱わない。
            for match in LINK_RE.finditer(CODE_RE.sub("", line)):
                target = match.group(1)
                if re.match(r"^[a-z][a-z0-9+.-]*:", target) or target.startswith("#"):
                    continue  # http(s)・mailto などと、同じ文書内のアンカー
                if looks_like_placeholder(target) or is_generated(target):
                    continue
                if not link_exists(base, target):
                    violations.append(f"{rel}:{number}: link: `{target}` が無い")

            for match in CODE_RE.finditer(line):
                value = match.group(1).strip()
                if " " in value or not value.startswith(PATH_PREFIXES) or "/" not in value:
                    continue
                if looks_like_placeholder(value) or is_generated(value):
                    continue
                if not path_exists(root, rel, base, value):
                    violations.append(f"{rel}:{number}: path: `{value}` が無い")
    return violations


def key(violation: str) -> str:
    """ベースラインの照合キー。行番号は編集でずれるので含めない。"""
    file, _line, rest = violation.split(":", 2)
    return f"{file}:{rest.strip()}"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--baseline", action="store_true", help="ベースラインを再生成する")
    parser.add_argument("--all", action="store_true", help="ベースラインも含めて全違反を表示する")
    args = parser.parse_args(argv)

    root = repo_root()
    violations = scan(root)

    if args.baseline:
        lines = sorted({key(v) for v in violations})
        (root / BASELINE).write_text(
            "# 文書中のリンク・パス・pnpm script の既知の違反（棚卸しで直して減らしていく対象）\n"
            "# 再生成: scripts/knowledge/check-doc-references.py --baseline\n"
            "# ここに無い違反が新しく入ると CI が失敗する。\n"
            + "".join(f"{line}\n" for line in lines),
            encoding="utf-8",
        )
        print(f"ベースラインを再生成しました: {len(lines)} 件")
        return 0

    known: set[str] = set()
    if (root / BASELINE).exists():
        known = {
            line for line in (root / BASELINE).read_text(encoding="utf-8").splitlines()
            if line and not line.startswith("#")
        }

    if args.all:
        for violation in violations:
            print(violation)
        print(f"\n全 {len(violations)} 件（うちベースライン {sum(key(v) in known for v in violations)} 件）")
        return 0

    new = [v for v in violations if key(v) not in known]
    resolved = known - {key(v) for v in violations}
    if new:
        print("❌ 文書中の参照先が見つかりません（ベースラインに無い新しい違反）:")
        for violation in new:
            print(f"  {violation}")
        print("\n直すか、意図的なら該当行に `doc-ref-ok` のコメントを添えてください。")
        return 1
    message = f"✅ 文書中のリンク・パス・pnpm script に新しい違反はありません（既知の未解消: {len(known) - len(resolved)} 件）"
    if resolved:
        message += f"。解消済み {len(resolved)} 件はベースラインから外せます（--baseline）"
    print(message)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
