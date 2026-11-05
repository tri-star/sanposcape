#!/usr/bin/env python3
"""コードの健全性の月次レポートの材料を集める（code-health-review skill。ADR-018）。

PR ごとに止める検査（check-structure.py・linter）では止めにくい兆候を、一覧にして並べる。直さない。課題にするかは skill が決める。

- hotspots : 頻繁に変わり、しかも大きい実装のファイル（直近の変更回数 × 行数）
- coupling : 親フォルダが違うのに一緒に変わるファイルの組（テストは対象の実装に寄せる）
- clones   : コピー＆ペーストされたコード（jscpd。TS・JS・Python）
- unused   : 使われていない export・ファイル・依存（mobile は knip）、関数・変数など（backend は vulture）
- structure: 構造の検査のベースラインの件数と、下げられる・外せる項目（ADR-016 決定6）

jscpd・knip・vulture が使えない（ネットワーク・node_modules が無いなど）ときは、その節を「省略」として理由を書き、残りは出す。

使い方:
    scripts/code-health/report-health.py                 # Markdown を標準出力へ
    scripts/code-health/report-health.py --json          # JSON
    scripts/code-health/report-health.py --skip-tools    # git の履歴とベースラインだけ（外部のツールを流さない）
    scripts/code-health/report-health.py --since "3 months ago" --top 20
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path, PurePosixPath

_HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("survey_structure", _HERE / "survey-structure.py")
ss = importlib.util.module_from_spec(_spec)
sys.modules["survey_structure"] = ss
_spec.loader.exec_module(ss)
cs = ss.cs  # check-structure.py（対象・テストの判定とベースライン）

DEFAULT_SINCE = "6 months ago"
DEFAULT_TOP = 15
# 一度に多くの実装のファイルを変えたコミット（一括の置き換え・整形・移動）は、責務の結び付きを表さないので組に数えない。
# フォルダの中だけを見る survey-structure.py（10）より広く、リポジトリ全体で数えるので大きめにする。
COUPLING_MAX_COMMIT_FILES = 20
COUPLING_MIN_COUNT = 3

# 版は固定する。jscpd 5 は依存の無い単体のバイナリ、vulture は Python 3.11 以上で依存が無いので、版で中身が決まる（ADR-018）。
# knip は依存があるので mobile の devDependency にして lockfile で固定している。
JSCPD = ["pnpm", "dlx", "jscpd@5.4.2"]
# uvx はプロジェクトの requires-python を見ないので、backend と同じ Python を指定する。
# 古い Python で動かすと、新しい構文（`class X[T]:`）のファイルを解析できずに飛ばす。
VULTURE = ["uvx", "--python", "3.12", "--from", "vulture==2.16", "vulture"]
KNIP = ["pnpm", "exec", "knip", "--reporter", "json", "--no-progress"]
TOOL_TIMEOUT = 600

JSCPD_FORMATS = "python,typescript,tsx,javascript,jsx,astro"
# check-structure.py の対象外（生成物・package の docs・マイグレーション）と、ツールの作業フォルダ。
# プライバシーポリシーの過去の版（`privacy/<施行日>.astro`）は、今の版と同じ文面を残すのが目的なので重複に数えない。
JSCPD_IGNORE = ",".join([
    "**/node_modules/**", "**/.venv/**", "**/dist/**", "**/.astro/**", "**/.expo/**",
    "**/api/generated/**", "packages/*/docs/**", "**/alembic/versions/**", "packages/lp/src/pages/privacy/**",
])
# knip の JSON の種類のうち、ファイルごとに名前を並べるもの（件数が多く、ファイル単位で判断するため）。
# それ以外の種類（files・dependencies・binaries など、knip の版で増えるものも含む）は1件ずつ並べる。
KNIP_PER_FILE = {"exports", "types", "enumMembers", "namespaceMembers", "duplicates"}
# 種類ではない項目（ファイルのパスと、CODEOWNERS があるときに付く所有者）。
KNIP_NOT_ISSUES = {"file", "owners"}
_VULTURE_RE = re.compile(r"^(?P<path>[^:]+):(?P<line>\d+): (?P<message>.+) \((?P<confidence>\d+)% confidence\)$")


class ToolUnavailable(Exception):
    """外部のツールが流せなかった。理由をレポートの節に書く。"""


# ---- git の履歴 ----

def git_history(root: Path, since: str) -> list[list[str]]:
    """直近のコミット（マージを除く）ごとの、packages/・scripts/ の中で変わったファイル。"""
    out = subprocess.run(
        # core.quotePath を切らないと、非 ASCII のパスが引用符つきで出て、黙って数えられなくなる。
        ["git", "-c", "core.quotePath=false", "log", f"--since={since}", "--no-merges", "--no-renames",
         "--format=%x00", "--name-only", "--", *cs.TARGET_ROOTS],
        cwd=root, check=True, capture_output=True, text=True,
    ).stdout
    return [[line for line in chunk.splitlines() if line.strip()] for chunk in out.split("\0")[1:]]


def implementation_files(files: list[str]) -> set[str]:
    return {f for f in files if cs.is_target(f) and not cs.is_test(f) and PurePosixPath(f).name not in cs.STRUCTURAL_FILES}


def hotspots(root: Path, impl: set[str], commits: list[list[str]], top: int) -> list[dict]:
    """変更回数 × 行数の大きい順。テストの変更は数えない（テストの多さは実装の変わりやすさを表さない）。"""
    changes = Counter(f for files in commits for f in set(files) if f in impl)
    rows = []
    for path, n in changes.items():
        lines = cs.count_lines(root / path) or 0
        rows.append({"path": path, "changes": n, "lines": lines, "score": n * lines})
    rows.sort(key=lambda r: (-r["score"], r["path"]))
    return rows[:top]


def coupling(impl: set[str], commits: list[list[str]], top: int,
             max_commit_files: int = COUPLING_MAX_COMMIT_FILES, min_count: int = COUPLING_MIN_COUNT) -> list[dict]:
    """親フォルダが違うのに一緒に変わった組。回数の多い順。

    `ratio` は、変更の少ないほうのファイルの変更回数のうち一緒に変わった割合。1.0 に近いほど、片方だけを変えることが無い。
    """
    changes, pairs = ss.co_changes(commits, impl, max_commit_files)
    rows = []
    for (a, b), n in pairs.items():
        if n < min_count or PurePosixPath(a).parent == PurePosixPath(b).parent:
            continue
        rows.append({"files": [a, b], "count": n, "ratio": round(n / min(changes[a], changes[b]), 2)})
    rows.sort(key=lambda r: (-r["count"], -r["ratio"], r["files"]))
    return rows[:top]


# ---- 外部のツール ----

def run_tool(cmd: list[str], cwd: Path, ok_codes: tuple[int, ...] = (0,)) -> subprocess.CompletedProcess:
    """ツールを流す。成功の終了コードはツールごとに渡す（見つかったものがあると 0 以外にするツールがある）。

    `pnpm dlx`・`uvx` はパッケージを取得できない（ネットワーク・sandbox）と exit 1 で終わる。
    1 を成功として扱うツール（knip）は、出力が読めないことで失敗を見分ける。
    """
    try:
        proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=TOOL_TIMEOUT)
    except FileNotFoundError as e:
        raise ToolUnavailable(f"`{cmd[0]}` が見つからない") from e
    except subprocess.TimeoutExpired as e:
        raise ToolUnavailable(f"{TOOL_TIMEOUT} 秒で終わらなかった") from e
    if proc.returncode not in ok_codes:
        tail = " / ".join((proc.stderr or proc.stdout).strip().splitlines()[-3:])
        raise ToolUnavailable(f"exit {proc.returncode}: {tail}")
    return proc


def summarize_clones(report: dict, root: Path, top: int) -> dict:
    """jscpd の JSON を、ファイルの組ごとの重複の行数にまとめる。テスト同士の重複は件数だけ数える（テストは並べて書くのが普通）。"""
    by_pair: dict[tuple[str, str], dict] = {}
    test_pairs: set[tuple[str, str]] = set()
    test_lines = 0
    for dup in report.get("duplicates", []):
        a, b = (_relative(dup[k]["name"], root) for k in ("firstFile", "secondFile"))
        key = tuple(sorted((a, b)))
        if cs.is_test(a) and cs.is_test(b):
            test_pairs.add(key)
            test_lines += dup.get("lines", 0)
            continue
        row = by_pair.setdefault(key, {"files": list(key), "clones": 0, "lines": 0, "ranges": []})
        row["clones"] += 1
        row["lines"] += dup.get("lines", 0)
        row["ranges"].append(f"{dup['firstFile']['start']}-{dup['firstFile']['end']} ↔ {dup['secondFile']['start']}-{dup['secondFile']['end']}")
    pairs = sorted(by_pair.values(), key=lambda r: (-r["lines"], r["files"]))
    formats = {
        name: round(stat.get("percentage", 0), 2)
        for name, stat in report.get("statistics", {}).get("formats", {}).items() if stat.get("sources")
    }
    total = report.get("statistics", {}).get("total", {})
    return {
        "total_percentage": round(total.get("percentage", 0), 2),
        "total_clones": total.get("clones", len(report.get("duplicates", []))),
        "formats": formats,
        "pairs": pairs[:top],
        "test_only": {"pairs": len(test_pairs), "lines": test_lines},
    }


def _relative(name: str, root: Path) -> str:
    path = Path(name)
    return str(path.relative_to(root)) if path.is_absolute() and path.is_relative_to(root) else name


def run_jscpd(root: Path, out_dir: Path, top: int) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    report_file = out_dir / "jscpd-report.json"
    # 前回の出力が残っていると、今回が失敗しても前回の結果を今回のものとして読んでしまう。
    report_file.unlink(missing_ok=True)
    # jscpd は重複を見つけても exit 0（--exit-code を付けないとき）。
    run_tool([*JSCPD, *cs.TARGET_ROOTS, "--format", JSCPD_FORMATS, "--ignore", JSCPD_IGNORE,
              "--reporters", "json", "--output", str(out_dir), "--absolute", "--no-colors", "--silent"], root)
    if not report_file.exists():
        raise ToolUnavailable("jscpd-report.json が出力されなかった")
    return summarize_clones(json.loads(report_file.read_text(encoding="utf-8")), root, top)


def summarize_knip(report: dict, prefix: str) -> dict:
    """knip の JSON を、種類ごとの一覧にまとめる。export・型はファイルごとに名前を並べる（件数が多く、ファイル単位で判断するため）。"""
    found: dict[str, list] = defaultdict(list)
    for issue in report.get("issues", []):
        path = f"{prefix}/{issue['file']}"
        for category, entries in issue.items():
            names = _knip_names(entries)
            if category in KNIP_NOT_ISSUES or not names:
                continue
            if category in KNIP_PER_FILE:
                found[category].append({"path": path, "names": names})
            else:
                found[category] += [path if category == "files" else f"{path}: {n}" for n in names]
    return {"counts": {k: sum(len(x["names"]) if isinstance(x, dict) else 1 for x in v) for k, v in found.items()},
            "items": dict(found)}


def _knip_names(entries: object) -> list[str]:
    """種類の値から名前を拾う。`duplicates` は同じものを指す名前の組（dict の配列の配列）なので `a = b` にまとめる。"""
    if not isinstance(entries, list):
        return []
    names = []
    for entry in entries:
        if isinstance(entry, dict):
            names.append(str(entry.get("name", "")))
        elif isinstance(entry, list):
            names.append(" = ".join(str(e.get("name", "")) for e in entry if isinstance(e, dict)))
    return [n for n in names if n]


def run_knip(root: Path) -> dict:
    mobile = root / "packages/mobile"
    if not (mobile / "node_modules").exists() and not (root / "node_modules/knip").exists():
        raise ToolUnavailable("node_modules が無い（pnpm install が要る）")
    if not (mobile / "src/api/generated").exists():
        # 生成物が無いと、それを import するファイルがすべて unresolved になり、一覧が埋まる。
        raise ToolUnavailable("Orval の生成物が無い（先に `pnpm --filter mobile orval`）")
    # knip は見つけたものがあると exit 1。knip が無い・起動できないときも pnpm exec が exit 1 になるので、JSON が読めるかで見分ける。
    proc = run_tool(KNIP, mobile, ok_codes=(0, 1))
    try:
        report = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        tail = " / ".join((proc.stderr or proc.stdout).strip().splitlines()[-3:])
        raise ToolUnavailable(f"JSON が読めない（exit {proc.returncode}: {tail}）") from e
    return summarize_knip(report, "packages/mobile")


def parse_vulture(output: str, prefix: str) -> list[dict]:
    rows = []
    for line in output.splitlines():
        match = _VULTURE_RE.match(line.strip())
        if match:
            rows.append({
                "path": f"{prefix}/{match['path']}", "line": int(match["line"]),
                "message": match["message"], "confidence": int(match["confidence"]),
            })
    return rows


def run_vulture(root: Path) -> dict:
    # 対象・閾値・除外するデコレータは packages/backend/pyproject.toml の [tool.vulture]。
    # vulture は未使用が無ければ exit 0、あれば 3。1 は入力が不正（解析できないファイル）、取得の失敗（uvx）も 1。
    proc = run_tool(VULTURE, root / "packages/backend", ok_codes=(0, 3))
    items = parse_vulture(proc.stdout, "packages/backend")
    # 解析できなかったファイルは標準エラーにだけ出て、未使用の一覧から黙って漏れる。レポートに出す。
    errors = [f"packages/backend/{line.strip()}" for line in proc.stderr.splitlines() if "invalid syntax" in line]
    return {"counts": {"impl": sum(not cs.is_test(i["path"]) for i in items), "test": sum(cs.is_test(i["path"]) for i in items)},
            "items": items, "errors": errors}


def guarded(name: str, func, *args) -> dict:
    try:
        return {"status": "ok", **func(*args)}
    except ToolUnavailable as e:
        return {"status": "skipped", "reason": f"{name}: {e}"}


# ---- 構造の検査のベースライン ----

def structure_status(root: Path, files: list[str]) -> dict:
    violations, warnings = cs.scan(root, files)
    entries = cs.load_baseline(root / cs.BASELINE)
    result = cs.compare(violations, entries)
    by_issue = Counter(str(e.get("issue") or "-") for e in entries)
    return {
        "baseline": len(entries),
        "by_issue": dict(sorted(by_issue.items())),
        "new": [f.describe() for f in result.new],
        "worsened": [f.describe() for f, _ in result.worsened],
        "lowerable": [f"{f.describe()} — ベースラインは {v}" for f, v in result.lowerable],
        "resolved": [f"{e.get('kind')} {e.get('path')}" + (f" `{e['prefix']}`" if e.get("prefix") else "") for e in result.resolved],
        "warnings": len(warnings),
    }


# ---- 出力 ----

def render(report: dict) -> str:
    out = [f"# コードの健全性レポート（{report['generated_at']}、履歴は {report['since']} から）"]
    out.append("\n## 頻繁に変わる大きいファイル（変更回数 × 行数）")
    out += [f"- {r['path']}: 変更 {r['changes']} 回 × {r['lines']} 行 = {r['score']}" for r in report["hotspots"]] or ["- なし"]
    out.append(f"\n## 別々のフォルダにあるのに一緒に変わる組（{COUPLING_MIN_COUNT} 回以上。大きいコミットは除く）")
    out += [f"- {r['count']} 回（割合 {r['ratio']}）: {r['files'][0]} + {r['files'][1]}" for r in report["coupling"]] or ["- なし"]
    out += _render_clones(report["clones"])
    out += _render_unused(report["knip"], report["vulture"])
    out += _render_structure(report["structure"])
    return "\n".join(out)


def _render_clones(clones: dict) -> list[str]:
    out = ["\n## コピー＆ペーストされたコード（jscpd）"]
    if clones["status"] != "ok":
        return out + [f"- 省略: {clones['reason']}"]
    formats = "、".join(f"{k} {v}%" for k, v in sorted(clones["formats"].items()))
    out.append(f"- 全体 {clones['total_percentage']}%（{clones['total_clones']} 件。{formats}）。"
               f"テスト同士の重複 {clones['test_only']['pairs']} 組・{clones['test_only']['lines']} 行は下に並べない")
    for r in clones["pairs"]:
        out.append(f"- {r['lines']} 行・{r['clones']} 箇所: {r['files'][0]} + {r['files'][1]}（{', '.join(r['ranges'][:3])}）")
    return out


def _render_unused(knip: dict, vulture: dict) -> list[str]:
    out = ["\n## 使われていないコード: mobile（knip）"]
    if knip["status"] != "ok":
        out.append(f"- 省略: {knip['reason']}")
    else:
        out.append("- 件数: " + ("、".join(f"{k} {v}" for k, v in knip["counts"].items()) or "なし"))
        for category, items in knip["items"].items():
            for item in items:
                text = f"{item['path']}: {', '.join(item['names'])}" if isinstance(item, dict) else item
                out.append(f"  - [{category}] {text}")
    out.append("\n## 使われていないコード: backend（vulture）")
    if vulture["status"] != "ok":
        return out + [f"- 省略: {vulture['reason']}"]
    out.append(f"- 件数: 実装 {vulture['counts']['impl']}、テスト {vulture['counts']['test']}")
    out += [f"- 解析できなかったファイル（このファイルの未使用は見ていない）: {e}" for e in vulture.get("errors", [])]
    out += [f"  - {i['path']}:{i['line']}: {i['message']}（{i['confidence']}%）" for i in vulture["items"]]
    return out


def _render_structure(st: dict) -> list[str]:
    out = ["\n## 構造の検査のベースライン（ADR-016）"]
    out.append(f"- 載っている項目 {st['baseline']} 件（" + "、".join(f"{k}: {v}" for k, v in st["by_issue"].items()) + f"）。警告 {st['warnings']} 件")
    for label, key in (("新しい違反", "new"), ("悪化", "worsened"), ("下げられる", "lowerable"), ("外せる", "resolved")):
        out += [f"- {label}: {text}" for text in st[key]]
    return out


def build_report(root: Path, since: str, top: int, skip_tools: bool, work_dir: Path) -> dict:
    files = cs.repo_files(root)
    impl = implementation_files(files)
    commits = git_history(root, since)
    skipped = {"status": "skipped", "reason": "--skip-tools"}
    return {
        "generated_at": date.today().isoformat(),
        "since": since,
        "hotspots": hotspots(root, impl, commits, top),
        "coupling": coupling(impl, commits, top),
        "clones": skipped if skip_tools else guarded("jscpd", run_jscpd, root, work_dir / "jscpd", top),
        "knip": skipped if skip_tools else guarded("knip", run_knip, root),
        "vulture": skipped if skip_tools else guarded("vulture", run_vulture, root),
        "structure": structure_status(root, files),
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--since", default=DEFAULT_SINCE, help=f"変更回数・一緒に変わった組を数える期間（git log --since。既定 {DEFAULT_SINCE!r}）")
    parser.add_argument("--top", type=int, default=DEFAULT_TOP, help=f"各節に並べる上位の件数（既定 {DEFAULT_TOP}）")
    parser.add_argument("--skip-tools", action="store_true", help="jscpd・knip・vulture を流さない")
    parser.add_argument("--work-dir", default="tmp/code-health", help="jscpd の JSON を置くフォルダ（既定 tmp/code-health。git の管理外）")
    parser.add_argument("--json", action="store_true", help="JSON で出力する")
    args = parser.parse_args(argv)

    root = cs.repo_root()
    report = build_report(root, args.since, args.top, args.skip_tools, root / args.work_dir)
    print(json.dumps(report, ensure_ascii=False, indent=2) if args.json else render(report))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
