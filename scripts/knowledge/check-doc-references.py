#!/usr/bin/env python3
"""文書中のリンク・ファイルパス・pnpm script が実在するかを検査する。

文書の乖離のうち、名前やパスのずれを機械的に止める（ADR-014 決定5 の3段目）。
レビュアーと違い、途中で検査を打ち切らない。意味の乖離（記述が動作と合っているか）は
change-review の doc-maintainer が見る。

検査すること（これ以外の書き方は検査しない。範囲外は doc-maintainer が見る）:
- link    : インラインの Markdown リンク `[text](path)` の行き先が実在するか（コードブロックの外）
- path    : インラインコードがパスだけで、`packages/`・`docs/`・`scripts/`・`.claude/`・`.github/`・`.agents/`・`.codex/`・
            `./`・`../` で始まるとき、実在するか（コードブロックの外）
- pnpm    : `pnpm --filter <package> <script>` の package と script が package.json にあるか（コードブロックの中も）
検査しないもの: package 相対の `src/...` などのパス、コマンドの形のインラインコード、コードブロック内のパス、参照形式のリンク

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
import os
import re
import subprocess
import sys
from collections import Counter
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
IGNORED_PREFIXES = (
    # launch-project が新しいプロジェクトへコピーする雛形。コピー先での相対パスで書かれている。
    ".claude/skills/launch-project/assets/",
)

# インラインコードのうち、リポジトリのパスとして検査するものの先頭。
PATH_PREFIXES = ("packages/", "docs/", "scripts/", ".claude/", ".github/", ".agents/", ".codex/", "./", "../")

# 生成物・gitignore 対象など、文書が「作られる場所」として書くパス。実在しなくてよい。
# 部分文字列ではなくパスの区切り単位で照合する（`/dist` が `distance_*.py` に当たらないように）。
GENERATED_SEGMENTS = {"node_modules", "dist", ".aws-sam", ".expo"}
GENERATED_PREFIXES = (
    "packages/mobile/src/api/generated",
    "src/api/generated",
    "packages/mobile/android/",
    "packages/mobile/ios/",
    "tmp/",
    ".claude/memory-access-log/",
)

# pnpm の組み込みコマンド（package.json の script ではないもの）。
PNPM_BUILTINS = {
    "add", "install", "i", "remove", "rm", "update", "up", "exec", "dlx", "why",
    "list", "ls", "outdated", "audit", "run", "store", "rebuild",
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
        if any(p.match(f) for p in SCAN_PATTERNS) and not f.startswith(IGNORED_PREFIXES)
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


class RepoFiles:
    """実在の判定を、ファイルシステムではなく git の管理下（追跡中と、無視されていない未追跡）のファイルで行う。

    手元にだけある gitignore 対象のファイル（`.env` など）で判定すると、手元では通り CI の checkout では落ちる。
    gitignore 対象のパスは、文書が「作られる場所・置く場所」として書くものとして違反にしない。
    """

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        out = subprocess.run(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
            capture_output=True, text=True, check=True, cwd=self.root,
        )
        self.files = set(out.stdout.splitlines())
        self.dirs = {str(parent) for f in self.files for parent in Path(f).parents if str(parent) != "."}
        self._ignored: dict[str, bool] = {}

    def is_ignored(self, rel: str) -> bool:
        if rel not in self._ignored:
            result = subprocess.run(
                ["git", "check-ignore", "-q", "--no-index", rel], cwd=self.root, capture_output=True,
            )
            self._ignored[rel] = result.returncode == 0
        return self._ignored[rel]

    def found(self, candidate: Path) -> bool:
        rel = os.path.relpath(os.path.normpath(candidate), self.root)
        if rel == "." or rel in self.files or rel in self.dirs:
            return True
        if rel.startswith(".."):
            return False  # リポジトリの外を指すパスは違反にする
        # `ADR-M-003` のように、ADR を番号だけで参照する書き方を許す。前方一致はこの形に限る
        # （一般のパスに許すと `walk/` が `walks/` に当たるような名前のずれを見逃す）。
        name = Path(rel).name
        if re.fullmatch(r"ADR-(?:[A-Z]-)?\d+", name):
            prefix = str(Path(rel).parent / name) + "-"
            return any(f.startswith(prefix) for f in self.files)
        return self.is_ignored(rel)


def link_exists(repo: RepoFiles, base: Path, value: str) -> bool:
    """Markdown のリンクは、その文書のディレクトリからの相対パス。"""
    value = value.split("#", 1)[0].split("?", 1)[0]
    return not value or repo.found(base / value)


def path_exists(repo: RepoFiles, root: Path, rel: str, base: Path, value: str) -> bool:
    """インラインコードのパスは、書き方がまちまちなので複数の起点を試す。

    ./ や ../ で始まればその文書から。そうでなければリポジトリのルート、文書が属する package のルート、文書のディレクトリの順。
    """
    value = value.split("#", 1)[0].rstrip(":,.")
    value = re.sub(r":\d+(-\d+)?$", "", value)  # file.py:34 のような行番号付きの参照
    if not value:
        return True
    if value.startswith(("./", "../")):
        return repo.found(base / value)
    starts = [root]
    parts = Path(rel).parts
    if len(parts) > 2 and parts[0] == "packages":
        starts.append(root / parts[0] / parts[1])
    starts.append(base)
    return any(repo.found(start / value) for start in starts)


def is_generated(value: str) -> bool:
    normalized = re.sub(r"^(\./|\.\./)+", "", value)
    if normalized.startswith(GENERATED_PREFIXES):
        return True
    return any(segment in GENERATED_SEGMENTS for segment in normalized.split("/"))


def scan(root: Path) -> list[str]:
    scripts = pnpm_scripts(root)
    repo = RepoFiles(root)
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
                    violations.append(f"{rel}:{number}: pnpm: package `{package}` が無い（script `{script}`）")
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
                if not link_exists(repo, base, target):
                    violations.append(f"{rel}:{number}: link: `{target}` が無い")

            for match in CODE_RE.finditer(line):
                value = match.group(1).strip()
                if " " in value or not value.startswith(PATH_PREFIXES) or "/" not in value:
                    continue
                if looks_like_placeholder(value) or is_generated(value):
                    continue
                if not path_exists(repo, root, rel, base, value):
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
        # 同じ違反が同じファイルに何か所あるかも数えるため、出現ごとに1行ずつ書く。
        lines = sorted(key(v) for v in violations)
        (root / BASELINE).write_text(
            "# 文書中のリンク・パス・pnpm script の既知の違反（棚卸しで直して減らしていく対象）\n"
            "# 再生成: scripts/knowledge/check-doc-references.py --baseline\n"
            "# 同じ行が複数あるのは、同じファイルの複数か所にある違反。ここより多く出ると CI が失敗する。\n"
            + "".join(f"{line}\n" for line in lines),
            encoding="utf-8",
        )
        print(f"ベースラインを再生成しました: {len(lines)} 件")
        return 0

    known: Counter[str] = Counter()
    if (root / BASELINE).exists():
        known = Counter(
            line for line in (root / BASELINE).read_text(encoding="utf-8").splitlines()
            if line and not line.startswith("#")
        )

    if args.all:
        for violation in violations:
            print(violation)
        print(f"\n全 {len(violations)} 件（ベースライン {sum(known.values())} 件）")
        return 0

    # キーごとに、ベースラインの件数を超えた分を新しい違反とする。
    remaining = known.copy()
    new: list[str] = []
    for violation in violations:
        if remaining[key(violation)] > 0:
            remaining[key(violation)] -= 1
        else:
            new.append(violation)
    resolved = sum(remaining.values())
    if new:
        print("❌ 文書中の参照先が見つかりません（ベースラインに無い新しい違反）:")
        for violation in new:
            print(f"  {violation}")
        print("\n直すか、意図的なら該当行に `doc-ref-ok` のコメントを添えてください。")
        return 1
    message = f"✅ 文書中のリンク・パス・pnpm script に新しい違反はありません（既知の未解消: {sum(known.values()) - resolved} 件）"
    if resolved:
        message += f"。解消済み {resolved} 件はベースラインから外せます（--baseline）"
    print(message)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
