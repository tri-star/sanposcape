#!/usr/bin/env python3
"""フォルダやファイルの分け方を決めるための材料を集める（structure-refactor skill の段階1）。

check-structure.py は「閾値を超えた」ことを止めるだけで、どこで切るかは決めない（ADR-016）。
このスクリプトも分け方は決めない。責務ごとのまとまりを見分けるための事実を、毎回同じ形で並べる。

フォルダを渡したとき:
- files     : 直下の実装ファイルと行数、隣にテストがあるか
- prefixes  : 名前の最初の語ごとのファイル（check-structure.py と同じ数え方）
- imports   : フォルダ内のファイル同士の import（どのファイルがどれを使うか）
- users     : フォルダの外からの利用元（利用元のフォルダごと）。移動したときに書き換える範囲の目安になる
- cochanges : git の履歴で一緒に変わったファイルの組（テストは実装のファイルに寄せて数える）

Python のファイルを渡したとき（テストのファイルを分けるとき）:
- defs      : トップレベルの定義（クラス・関数）と行の範囲。テストのクラスが叩くエンドポイント
- helpers   : モジュールの関数・クラスを、どのトップレベルの定義が使っているか

使い方:
    scripts/code-health/survey-structure.py packages/mobile/src/features/pin/lib
    scripts/code-health/survey-structure.py packages/backend/src/sanposcape/sanpo_maps/pins/tests/test_router.py
    scripts/code-health/survey-structure.py <path> --since "12 months ago" --json
"""

from __future__ import annotations

import argparse
import ast
import importlib.util
import itertools
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path, PurePosixPath

_CHECK = Path(__file__).resolve().parent / "check-structure.py"
_spec = importlib.util.spec_from_file_location("check_structure", _CHECK)
cs = importlib.util.module_from_spec(_spec)
sys.modules["check_structure"] = cs  # dataclass が型の解決でモジュールを引くため
_spec.loader.exec_module(cs)

# `@/` のエイリアスの先（packages/mobile/tsconfig.json の paths）。
TS_ALIASES = {"@/": "packages/mobile/src/"}
TS_EXTENSIONS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
# この名前のフォルダに置いたテストは、1つ上のフォルダの実装のテストとして寄せる（`pins/tests/test_service.py` → `pins/service.py`）。
TEST_DIRS_OF_SUBJECT = {"tests", "__tests__"}
# Python の絶対 import の起点（`sanposcape.x` → packages/backend/src/sanposcape/x.py）。
PY_ROOTS = ("packages/backend/src",)

# フォルダの中で一度に多くのファイルを変えたコミット（一括の置き換え・整形・移動）は、責務の近さを表さないので組に数えない。
DEFAULT_MAX_COMMIT_FILES = 10
DEFAULT_SINCE = "12 months ago"

_TS_IMPORT_RE = re.compile(
    r"""(?:^|[;\s])(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\sfrom\s*)?["']([^"']+)["']"""
    r"""|\bimport\(\s*["']([^"']+)["']\s*\)"""
    r"""|\b(?:vi|jest)\.mock\(\s*["']([^"']+)["']""",
    re.MULTILINE,
)
_HTTP_METHODS = {"get", "post", "put", "patch", "delete"}


# ---- import の解決 ----

def subject_of(path: str) -> str:
    """テストのファイルを、そのテストの対象の実装のファイルに寄せる。

    隣に置くテスト（mobile の `a.test.ts` → `a.ts`）と、`tests/` に置くテスト（backend の `pins/tests/test_service.py` → `pins/service.py`）の両方を扱う。
    """
    p = PurePosixPath(path)
    name = re.sub(r"\.(test|spec)(\.[A-Za-z]+)$", r"\2", p.name)
    if name.startswith("test_") and name.endswith(".py"):
        name = name[len("test_"):]
    folder = p.parent
    if folder.name in TEST_DIRS_OF_SUBJECT:
        folder = folder.parent
    return str(folder / name)


def _resolve_ts_candidate(base: str, known: set[str]) -> str | None:
    base = str(PurePosixPath(base))
    for candidate in [base, *(base + ext for ext in TS_EXTENSIONS), *(f"{base}/index{ext}" for ext in TS_EXTENSIONS)]:
        if candidate in known:
            return candidate
    return None


def _normalize(path: str) -> str:
    parts: list[str] = []
    for part in PurePosixPath(path).parts:
        if part == "..":
            if parts:
                parts.pop()
        elif part != ".":
            parts.append(part)
    return "/".join(parts)


def ts_imports(path: str, text: str, known: set[str]) -> set[str]:
    """TS / JS のファイルが import しているリポジトリ内のファイル。解決できないもの（パッケージ）は返さない。"""
    found: set[str] = set()
    folder = str(PurePosixPath(path).parent)
    for match in _TS_IMPORT_RE.finditer(text):
        spec = next(g for g in match.groups() if g)
        if spec.startswith("."):
            base = _normalize(f"{folder}/{spec}")
        else:
            alias = next((a for a in TS_ALIASES if spec.startswith(a)), None)
            if alias is None:
                continue
            base = TS_ALIASES[alias] + spec[len(alias):]
        resolved = _resolve_ts_candidate(base, known)
        if resolved and resolved != path:
            found.add(resolved)
    return found


def _py_module_file(module: str, known: set[str]) -> str | None:
    rel = module.replace(".", "/")
    for root in PY_ROOTS:
        for candidate in (f"{root}/{rel}.py", f"{root}/{rel}/__init__.py"):
            if candidate in known:
                return candidate
    return None


def _py_package_of(path: str) -> str | None:
    for root in PY_ROOTS:
        if path.startswith(root + "/"):
            return str(PurePosixPath(path[len(root) + 1:]).parent).replace("/", ".")
    return None


def py_imports(path: str, text: str, known: set[str]) -> set[str]:
    """Python のファイルが import しているリポジトリ内のファイル。`from pkg import submodule` はサブモジュールのファイルに解決する。"""
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return set()
    found: set[str] = set()
    package = _py_package_of(path)
    for node in ast.walk(tree):
        # 1つの文の名前ごとに、解決を試す候補を並べる（前から試し、最初に解決できたものを採る）。
        candidates: list[list[str]] = []
        if isinstance(node, ast.Import):
            candidates = [[alias.name] for alias in node.names]
        elif isinstance(node, ast.ImportFrom):
            base = node.module or ""
            if node.level:
                if package is None:
                    continue
                parts = package.split(".")
                parts = parts[: len(parts) - (node.level - 1)] if node.level > 1 else parts
                base = ".".join([*parts, base] if base else parts)
            # `from pkg import a, b` の名前はサブモジュールかもしれない。どれもサブモジュールでなければ `pkg` 自身に寄せる。
            candidates = [[f"{base}.{alias.name}", base] for alias in node.names]
        for modules in candidates:
            for module in modules:
                resolved = _py_module_file(module, known)
                if resolved and resolved != path and not resolved.endswith("__init__.py"):
                    found.add(resolved)
                    break
    return found


def imports_of(root: Path, path: str, known: set[str]) -> set[str]:
    try:
        text = (root / path).read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return set()
    if path.endswith(".py"):
        return py_imports(path, text, known)
    if PurePosixPath(path).suffix in TS_EXTENSIONS + (".astro",):
        return ts_imports(path, text, known)
    return set()


# ---- フォルダ ----

def co_changes(commits: list[list[str]], members: set[str], max_files: int) -> tuple[Counter, Counter]:
    """コミットごとの変更ファイルから、フォルダの実装のファイルの変更回数と、一緒に変わった組の回数を数える。

    フォルダの中で max_files を超えるファイルを変えたコミット（一括の置き換え・整形・移動）は、責務の近さを表さないので組に数えない（変更回数には数える）。
    """
    changes: Counter = Counter()
    pairs: Counter = Counter()
    for files in commits:
        touched = sorted({subject_of(f) for f in files} & members)
        changes.update(touched)
        if len(touched) <= max_files:
            pairs.update(itertools.combinations(touched, 2))
    return changes, pairs


def git_commits(root: Path, target: str, since: str) -> list[list[str]]:
    """target に触れたコミット（マージを除く）ごとの、target の中で変わったファイルの一覧。"""
    out = subprocess.run(
        # core.quotePath を切らないと、非 ASCII のパスが引用符つきのエスケープで出て、黙って数えられなくなる（git ls-files の -z と同じ落とし穴）。
        ["git", "-c", "core.quotePath=false", "log", f"--since={since}", "--no-merges", "--no-renames", "--format=%x00", "--name-only", "--", target],
        cwd=root, check=True, capture_output=True, text=True,
    ).stdout
    return [[line for line in chunk.splitlines() if line.strip()] for chunk in out.split("\0")[1:]]


def survey_folder(root: Path, folder: str, files: list[str], commits: list[list[str]], max_commit_files: int) -> dict:
    folder = folder.rstrip("/")
    known = set(files)
    direct = sorted(f for f in files if str(PurePosixPath(f).parent) == folder and cs.is_target(f))
    impl = [f for f in direct if not cs.is_test(f) and PurePosixPath(f).name not in cs.STRUCTURAL_FILES]
    # 隣のテストと、`tests/` に置いたテスト（backend）の両方を、対象の実装に寄せて数える。
    tests = {subject_of(f) for f in files if cs.is_test(f) and str(PurePosixPath(subject_of(f)).parent) == folder}
    members = set(impl)

    rows = [{"file": PurePosixPath(f).name, "lines": cs.count_lines(root / f), "tested": f in tests} for f in impl]

    prefixes: dict[str, list[str]] = defaultdict(list)
    for f in impl:
        prefixes[cs.first_word(PurePosixPath(f).name, folder) or "-"].append(PurePosixPath(f).name)

    internal: dict[str, list[str]] = {}
    for f in impl:
        used = sorted(PurePosixPath(t).name for t in imports_of(root, f, known) & members)
        if used:
            internal[PurePosixPath(f).name] = used

    users: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for f in files:
        if not cs.is_target(f) or str(PurePosixPath(f).parent) == folder:
            continue
        for target in imports_of(root, f, known) & members:
            users[PurePosixPath(target).name][str(PurePosixPath(f).parent)] += 1

    changes, pairs = co_changes(commits, members, max_commit_files)
    return {
        "kind": "folder",
        "path": folder,
        "files": rows,
        "prefixes": {k: v for k, v in sorted(prefixes.items(), key=lambda kv: (-len(kv[1]), kv[0]))},
        "imports": internal,
        "users": {k: dict(sorted(v.items())) for k, v in sorted(users.items())},
        "changes": {PurePosixPath(k).name: v for k, v in changes.most_common()},
        "cochanges": [
            {"files": [PurePosixPath(a).name, PurePosixPath(b).name], "count": n}
            for (a, b), n in pairs.most_common() if n >= 2
        ],
    }


# ---- Python のファイル ----

def _direct_endpoints(node: ast.AST) -> Counter:
    """`client.post("/pins", ...)` のような呼び出しから「メソッド パス」と呼んだ回数を拾う。f-string の値の部分は `{}` にする。"""
    found: Counter = Counter()
    for call in ast.walk(node):
        if not (isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and call.func.attr in _HTTP_METHODS and call.args):
            continue
        arg = call.args[0]
        if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
            path = arg.value
        elif isinstance(arg, ast.JoinedStr):
            path = "".join(v.value if isinstance(v, ast.Constant) else "{}" for v in arg.values)
        else:
            continue
        if path.startswith("/"):
            found[f"{call.func.attr.upper()} {path.split('?', 1)[0]}"] += 1
    return found


def _self_calls(node: ast.AST) -> Counter:
    """`self._post(...)` のような、同じクラスのメソッドの呼び出しの回数。"""
    return Counter(
        call.func.attr for call in ast.walk(node)
        if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute)
        and isinstance(call.func.value, ast.Name) and call.func.value.id == "self"
    )


def _endpoints(node: ast.AST) -> dict[str, int]:
    """叩くエンドポイントと回数。準備のために叩くもの（ピンを作ってから消す、など）も混ざるので、回数の多いものが主に確かめている操作の目安になる。

    クラスでは、クラスの中のヘルパー（`self._patch(...)`）が叩くエンドポイントを、呼んだ回数ぶん呼び出し元に足す。
    ヘルパーの中の1回だけを数えると、ヘルパーを通して確かめるクラスの主な操作が読めないため（SS-254 レビュー）。
    """
    if not isinstance(node, ast.ClassDef):
        found = _direct_endpoints(node)
    else:
        methods = {m.name: m for m in node.body if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef))}
        memo: dict[str, Counter] = {}

        def expand(name: str, seen: frozenset[str]) -> Counter:
            if name in memo:
                return memo[name]
            total = _direct_endpoints(methods[name])
            for callee, times in _self_calls(methods[name]).items():
                if callee in methods and callee not in seen:
                    for endpoint, n in expand(callee, seen | {callee}).items():
                        total[endpoint] += n * times
            memo[name] = total
            return total

        found = Counter()
        called = {c for m in methods.values() for c in _self_calls(m)}
        # テストのメソッドと、どこからも呼ばれないメソッド（fixture など）を起点に数える。ヘルパーは呼ばれた回数ぶん数える。
        for name in methods:
            if name.startswith("test_") or name not in called:
                found.update(expand(name, frozenset({name})))
    return dict(sorted(found.items(), key=lambda kv: (-kv[1], kv[0])))


def _fixtures(tests: list[ast.AST]) -> list[str]:
    """テストの関数の引数（pytest の fixture）。`self` は除く。"""
    return sorted({a.arg for t in tests for a in t.args.args + t.args.kwonlyargs} - {"self"})


def survey_python_file(root: Path, path: str) -> dict:
    tree = ast.parse((root / path).read_text(encoding="utf-8"))
    defs = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))]
    names = {n.name for n in defs}
    rows = []
    helpers: dict[str, list[str]] = defaultdict(list)
    for node in defs:
        start = min([node.lineno, *(d.lineno for d in node.decorator_list)])
        if isinstance(node, ast.ClassDef):
            tests = [m for m in node.body if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef)) and m.name.startswith("test_")]
        else:
            tests = [node] if node.name.startswith("test_") else []
        rows.append({
            "name": node.name,
            "kind": "class" if isinstance(node, ast.ClassDef) else "function",
            "lines": [start, node.end_lineno],
            "size": node.end_lineno - start + 1,
            "tests": len(tests),
            "endpoints": _endpoints(node),
            "fixtures": _fixtures(tests),
        })
        used = {n.id for n in ast.walk(node) if isinstance(n, ast.Name)} & names
        for name in sorted(used - {node.name}):
            helpers[name].append(node.name)
    return {"kind": "python-file", "path": path, "lines": cs.count_lines(root / path), "defs": rows, "helpers": dict(helpers)}


# ---- 出力 ----

def render(report: dict) -> str:
    out: list[str] = []
    if report["kind"] == "python-file":
        out.append(f"# {report['path']}（{report['lines']} 行）\n\n## トップレベルの定義")
        for d in report["defs"]:
            out.append(f"- {d['name']}（{d['kind']}、{d['lines'][0]}-{d['lines'][1]} 行目、{d['size']} 行、テスト {d['tests']}）")
            if d["endpoints"]:
                out.append("  - 叩くエンドポイント（回数）: " + ", ".join(f"{e} ×{n}" for e, n in d["endpoints"].items()))
            if d["fixtures"]:
                out.append("  - 引数（fixture・parametrize）: " + ", ".join(d["fixtures"]))
        out.append("\n## モジュールの関数・クラスの利用元")
        out += [f"- {name} ← {', '.join(users)}" for name, users in report["helpers"].items()] or ["- なし"]
        return "\n".join(out)

    out.append(f"# {report['path']}/（実装 {len(report['files'])} 個）\n\n## ファイル（行数・テストの有無・変更回数）")
    for row in report["files"]:
        mark = "" if row["tested"] else "、テストなし"
        out.append(f"- {row['file']}: {row['lines']} 行{mark}、変更 {report['changes'].get(row['file'], 0)} 回")
    out.append("\n## 接頭辞（最初の語）")
    out += [f"- {prefix}（{len(members)}）: {', '.join(members)}" for prefix, members in report["prefixes"].items()]
    out.append("\n## フォルダ内の import（使う側 → 使われる側）")
    out += [f"- {src} → {', '.join(dsts)}" for src, dsts in report["imports"].items()] or ["- なし"]
    out.append("\n## フォルダの外からの利用元（ファイル ← 利用元のフォルダ: 件数）")
    out += [f"- {name} ← " + ", ".join(f"{d}: {n}" for d, n in dirs.items()) for name, dirs in report["users"].items()] or ["- なし"]
    out.append("\n## 一緒に変わったファイルの組（2回以上。フォルダの中で一度に多くのファイルを変えたコミットは除く）")
    out += [f"- {c['count']} 回: {c['files'][0]} + {c['files'][1]}" for c in report["cochanges"]] or ["- なし"]
    return "\n".join(out)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("path", help="リポジトリのルートからのフォルダか Python のファイルのパス")
    parser.add_argument("--since", default=DEFAULT_SINCE, help=f"一緒に変わったファイルを数える期間（git log --since。既定 {DEFAULT_SINCE!r}）")
    parser.add_argument("--max-commit-files", type=int, default=DEFAULT_MAX_COMMIT_FILES,
                        help=f"フォルダの中でこれより多くのファイルを変えたコミットは組に数えない（既定 {DEFAULT_MAX_COMMIT_FILES}）")
    parser.add_argument("--json", action="store_true", help="JSON で出力する")
    args = parser.parse_args(argv)

    root = cs.repo_root()
    target = str(PurePosixPath(args.path.rstrip("/")))
    if (root / target).is_dir():
        commits = git_commits(root, target, args.since)
        report = survey_folder(root, target, cs.repo_files(root), commits, args.max_commit_files)
    elif target.endswith(".py") and (root / target).is_file():
        report = survey_python_file(root, target)
    else:
        print(f"フォルダか Python のファイルを渡してください: {target}", file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2) if args.json else render(report))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
