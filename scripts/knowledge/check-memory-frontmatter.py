#!/usr/bin/env python3
"""agent-memory の front-matter 規約を検査する。

docs/knowledge-management.md で定めた規約に沿っているかを機械的に確認し、
「決定事項が ADR に無いまま agent-memory にだけ残る」「チケット固有のメモが
恒久メモリとして溜まり続ける」状態の流入を止める。

使い方:
    scripts/knowledge/check-memory-frontmatter.py <file>...  # 指定ファイルを検査
    scripts/knowledge/check-memory-frontmatter.py --all      # 全メモリを検査
    scripts/knowledge/check-memory-frontmatter.py --baseline # ベースラインを再生成
    scripts/knowledge/check-memory-frontmatter.py --enforce-all <file>  # ベースラインを無視して検査

ベースラインに載っているファイルは既知の未整備として検査をスキップする。
棚卸しで整備したらベースラインを再生成して減らしていく。
"""

from __future__ import annotations

import datetime as dt
import re
import subprocess
import sys
from pathlib import Path

MEMORY_ROOT = Path(".claude/agent-memory")
BASELINE_FILE = Path("scripts/knowledge/memory-frontmatter-baseline.txt")

VALID_TYPES = {"feedback", "project", "reference"}
VALID_SCOPES = {"durable", "task-local"}

# プロジェクトルート相対の tmp/ のみ。/tmp/ や $TMPDIR は対象外。
TMP_REF = re.compile(r"(^|[^/\w.-])tmp/[\w.-]|<project-root>/tmp/")


def repo_root() -> Path:
    out = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=True,
    )
    return Path(out.stdout.strip())


def parse_front_matter(text: str) -> dict[str, str] | None:
    """`---` で囲まれた front-matter を平坦な dict にする。

    metadata 配下のキーは `metadata.<key>` として格納する。
    ネストは1段のみを想定しており、汎用 YAML パーサではない。
    """
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---", 3)
    if end == -1:
        return None

    result: dict[str, str] = {}
    section: str | None = None
    for raw in text[4:end].splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indented = raw[0] in " \t"
        line = raw.strip()
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key, value = key.strip(), value.strip()
        if not value:
            if not indented:
                section = key
            continue
        result[f"{section}.{key}" if indented and section else key] = value
    return result


def check_file(path: Path, root: Path) -> list[str]:
    rel = path.relative_to(root)
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []

    fm = parse_front_matter(text)
    if fm is None:
        return [f"front-matter (`---` で囲まれたブロック) がありません"]

    for key in ("name", "description"):
        if not fm.get(key):
            errors.append(f"`{key}` が必須です")

    name = fm.get("name", "")
    # `_` と `-` の揺れは許容する（既存メモリで両方の表記が使われているため）
    if name and name.replace("_", "-") != path.stem.replace("_", "-"):
        errors.append(f"`name: {name}` がファイル名 `{path.stem}` と一致しません")

    mem_type = fm.get("metadata.type", "")
    if not mem_type:
        errors.append("`metadata.type` が必須です (feedback / project / reference)")
    elif mem_type not in VALID_TYPES:
        errors.append(
            f"`metadata.type: {mem_type}` は不正です。{' / '.join(sorted(VALID_TYPES))} のいずれかにしてください"
        )

    scope = fm.get("metadata.scope", "")
    if not scope:
        errors.append(
            "`metadata.scope` が必須です。チケットを越えて再利用するなら `durable`、"
            "このチケット限定なら `task-local` を指定してください"
        )
    elif scope not in VALID_SCOPES:
        errors.append(
            f"`metadata.scope: {scope}` は不正です。{' / '.join(sorted(VALID_SCOPES))} のいずれかにしてください"
        )

    if scope == "task-local" and not fm.get("metadata.source_issue"):
        errors.append(
            "`scope: task-local` では `metadata.source_issue` (例: SS-42) が必須です。"
            "チケット完了時の削除判定に使います"
        )

    if mem_type == "project" and scope == "durable" and not fm.get("metadata.adr"):
        errors.append(
            "`type: project` かつ `scope: durable` では `metadata.adr` で転記先の ADR を示してください。\n"
            "      決定事項は ADR が正本です (adr-writing skill を利用)。\n"
            "      まだ ADR に落とせていない段階なら `scope: task-local` + `source_issue` にしてください"
        )

    adr = fm.get("metadata.adr", "")
    if adr and not (root / adr).exists():
        errors.append(f"`metadata.adr: {adr}` が存在しません")

    verify_by = fm.get("metadata.verify_by", "")
    if verify_by:
        try:
            dt.date.fromisoformat(verify_by)
        except ValueError:
            errors.append(f"`metadata.verify_by: {verify_by}` は YYYY-MM-DD 形式で指定してください")

    for lineno, line in enumerate(text.splitlines(), start=1):
        if TMP_REF.search(line) and "tmp-ref-ok" not in line:
            errors.append(
                f"{lineno}行目が `tmp/` を参照しています。tmp/ は .gitignore 対象のため"
                "別環境でリンク切れになります。要点を本文に直接書くか ADR へ昇格させてください"
            )

    index = path.parent / "MEMORY.md"
    if index.exists() and path.name != "MEMORY.md":
        if f"({path.name})" not in index.read_text(encoding="utf-8"):
            errors.append(
                f"`{rel.parent}/MEMORY.md` にインデックス行がありません。"
                f"`- [タイトル]({path.name}) — 要約` を追記してください"
            )

    return errors


def memory_files(root: Path) -> list[Path]:
    return sorted(
        p
        for p in (root / MEMORY_ROOT).rglob("*.md")
        if p.name != "MEMORY.md"
    )


def load_baseline(root: Path) -> set[str]:
    path = root / BASELINE_FILE
    if not path.exists():
        return set()
    return {
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    }


def main(argv: list[str]) -> int:
    root = repo_root()
    baseline = load_baseline(root)

    if "--baseline" in argv:
        failing = [
            str(p.relative_to(root))
            for p in memory_files(root)
            if check_file(p, root)
        ]
        (root / BASELINE_FILE).write_text(
            "# front-matter 規約を満たしていない既知のメモリ（棚卸しで整備・削除していく対象）\n"
            "# 再生成: scripts/knowledge/check-memory-frontmatter.py --baseline\n"
            "# ここに無いファイルが規約違反になった場合、フック/CIが失敗する。\n"
            + "".join(f"{p}\n" for p in failing),
            encoding="utf-8",
        )
        print(f"ベースラインを更新しました: {BASELINE_FILE} ({len(failing)} ファイル)")
        return 0

    enforce_all = "--enforce-all" in argv

    if "--all" in argv:
        targets = memory_files(root)
    else:
        targets = [Path(a).resolve() for a in argv if not a.startswith("-")]
        targets = [p for p in targets if p.is_file()]

    failed = 0
    for path in targets:
        try:
            rel = str(path.resolve().relative_to(root))
        except ValueError:
            continue
        if not rel.startswith(str(MEMORY_ROOT)) or path.name == "MEMORY.md":
            continue
        if rel in baseline and not enforce_all:
            continue
        errors = check_file(path.resolve(), root)
        if errors:
            failed += 1
            legacy = " （既知の未整備。編集したこの機会に整備してください）" if rel in baseline else ""
            print(f"\n❌ {rel}{legacy}", file=sys.stderr)
            for err in errors:
                print(f"  - {err}", file=sys.stderr)

    if failed:
        print(
            f"\n{failed} 件のメモリが front-matter 規約を満たしていません。"
            "\n規約: docs/knowledge-management.md",
            file=sys.stderr,
        )
        return 1

    remaining = len(baseline)
    if "--all" in argv:
        print(f"✅ front-matter 規約 OK（既知の未整備: {remaining} ファイル）")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
