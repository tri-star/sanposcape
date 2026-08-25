#!/usr/bin/env python3
"""PR の変更ファイルを機械的に分類し、章立ての材料を JSON で出力する。

review-tour skill の「事実収集」フェーズで使う。
分類まで LLM に任せると結果がブレるため、パスから機械的に決まる部分
(package / layer / feature / 生成物かどうか) はここで確定させ、
LLM には「どう束ねてどう名付けるか」だけを担当させる。

使い方:
    python3 .claude/skills/review-tour/scripts/collect-pr-facts.py 123
    python3 .claude/skills/review-tour/scripts/collect-pr-facts.py --local
    python3 .claude/skills/review-tour/scripts/collect-pr-facts.py --local develop

注意: PR モードは gh api のページングを使うため、変更ファイルが 3000 を超える
      巨大 PR では取りこぼす。その場合は --local を使うこと。
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

# 上にあるルールほど優先される。テスト・マイグレーションは
# ディレクトリ内の他ルールより先に判定させる必要がある。
LAYER_RULES: list[tuple[str, str]] = [
    (r"^\.github/", "ci"),
    (r"(^|/)adr/", "adr"),
    (r"^packages/backend/alembic/", "migration"),
    (r"(^|/)\.maestro/", "e2e"),
    (r"(^|/)tests?/", "test"),
    (r"(^|/)test_[^/]+\.py$", "test"),
    (r"_test\.py$", "test"),
    (r"\.(test|spec)\.[jt]sx?$", "test"),
    (r"^packages/backend/openapi\.(json|ya?ml)$", "api-spec"),
    (r"^packages/backend/src/.*/router\.py$", "router"),
    (r"^packages/backend/src/.*/(service|stats)\.py$", "service"),
    (r"^packages/backend/src/.*/repository\.py$", "repository"),
    (r"^packages/backend/src/.*/models\.py$", "model"),
    (r"^packages/backend/src/.*/schemas\.py$", "schema"),
    (r"^packages/backend/src/.*/mappers\.py$", "mapper"),
    (r"^packages/backend/src/.*/dependencies\.py$", "di"),
    (r"^packages/backend/src/.*/exceptions\.py$", "exception"),
    (r"^packages/backend/src/sanposcape/core/", "backend-core"),
    (r"^packages/backend/src/", "backend-other"),
    (r"^packages/backend/scripts/", "backend-script"),
    (r"^packages/mobile/app/", "mobile-route"),
    (r"^packages/mobile/src/api/", "mobile-api-generated"),
    (r"^packages/mobile/src/features/[^/]+/api/", "mobile-api"),
    (r"^packages/mobile/src/(features/[^/]+/)?components/", "mobile-component"),
    (r"^packages/mobile/src/(features/[^/]+/)?hooks/", "mobile-hook"),
    (r"^packages/mobile/src/(features/[^/]+/)?store/", "mobile-store"),
    (r"^packages/mobile/src/services/", "mobile-service"),
    (r"^packages/mobile/src/(features/[^/]+/)?lib/", "mobile-lib"),
    (r"^packages/mobile/src/(features/[^/]+/)?data/", "mobile-data"),
    (r"^packages/mobile/src/(features/[^/]+/)?types\.ts$", "mobile-type"),
    (r"^packages/mobile/(src/theme/|design/)", "design"),
    (r"^packages/mobile/src/", "mobile-other"),
    (r"(^|/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|uv\.lock|pyproject\.toml)$", "deps"),
    (r"(^|/)(Dockerfile|compose\.ya?ml)$", "infra"),
    (r"(^|/)\.env(\.[A-Za-z]+)?$", "infra"),
    (r"\.tf$", "infra"),
    (r"^\.claude/", "agent-config"),
    (r"\.md$", "docs"),
]

# 自動生成物・ロックファイル。1行ずつ読む必要はなく、章では「再生成された」
# 事実だけ伝えれば足りるので、章立ての段階で切り離せるように印を付ける。
GENERATED_RULES = [
    r"^packages/mobile/src/api/",
    r"^packages/backend/openapi\.(json|ya?ml)$",
    r"(^|/)(pnpm-lock\.yaml|uv\.lock)$",
]

# 差分としては大きいが、行を追ってもレビュー価値が薄いファイル。
NOISE_RULES = [
    r"\.(png|jpg|jpeg|gif|svg|webp|ttf|otf|woff2?)$",
]


def run(cmd: list[str]) -> str:
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    except FileNotFoundError:
        sys.exit(f"error: コマンドが見つかりません: {cmd[0]}")
    except subprocess.CalledProcessError as exc:
        sys.exit(f"error: {' '.join(cmd)} が失敗しました\n{exc.stderr.strip()}")
    return result.stdout


def classify_layer(path: str) -> str:
    for pattern, layer in LAYER_RULES:
        if re.search(pattern, path):
            return layer
    return "other"


def classify_package(path: str) -> str:
    if path.startswith("packages/backend/"):
        return "backend"
    if path.startswith("packages/mobile/"):
        return "mobile"
    return "root"


def classify_feature(path: str):
    """機能名(縦切りの単位)を推定する。束ね方の第一候補になる。"""
    m = re.match(r"^packages/backend/src/sanposcape/([^/]+)/", path)
    if m and m.group(1) not in ("tests",):
        return m.group(1)
    if path.startswith("packages/backend/alembic/"):
        return "migration"
    m = re.match(r"^packages/mobile/src/features/([^/]+)/", path)
    if m:
        return m.group(1)
    m = re.match(r"^packages/mobile/src/services/([^/]+)/", path)
    if m:
        return m.group(1)
    m = re.match(r"^packages/mobile/app/(?:\(([^)]+)\)|([^/]+))/", path)
    if m:
        return m.group(1) or m.group(2)
    return None


def matches_any(path: str, patterns: list[str]) -> bool:
    return any(re.search(p, path) for p in patterns)


def build_file_entry(path: str, status: str, additions: int, deletions: int) -> dict:
    return {
        "path": path,
        "status": status,
        "additions": additions,
        "deletions": deletions,
        "churn": additions + deletions,
        "package": classify_package(path),
        "layer": classify_layer(path),
        "feature": classify_feature(path),
        "generated": matches_any(path, GENERATED_RULES),
        "noise": matches_any(path, NOISE_RULES),
    }


def collect_from_pr(pr_number: str):
    meta_fields = (
        "number,title,url,author,baseRefName,headRefName,body,"
        "additions,deletions,changedFiles,commits,isDraft,state"
    )
    meta = json.loads(run(["gh", "pr", "view", pr_number, "--json", meta_fields]))

    raw = run(["gh", "api", f"repos/{{owner}}/{{repo}}/pulls/{pr_number}/files", "--paginate"])
    # --paginate は JSON 配列を連結して出力するため、デコーダで順に読み進める。
    decoder = json.JSONDecoder()
    files_raw: list[dict] = []
    index = 0
    while index < len(raw):
        while index < len(raw) and raw[index].isspace():
            index += 1
        if index >= len(raw):
            break
        chunk, index = decoder.raw_decode(raw, index)
        files_raw.extend(chunk)

    files = [
        build_file_entry(
            f["filename"],
            f.get("status", "modified"),
            f.get("additions", 0),
            f.get("deletions", 0),
        )
        for f in files_raw
    ]

    pr_info = {
        "mode": "pr",
        "number": meta["number"],
        "title": meta["title"],
        "url": meta["url"],
        "author": (meta.get("author") or {}).get("login"),
        "state": meta.get("state"),
        "is_draft": meta.get("isDraft"),
        "base": meta["baseRefName"],
        "head": meta["headRefName"],
        "body": meta.get("body") or "",
        "commits": [
            {"sha": c["oid"][:8], "message": c.get("messageHeadline", "")}
            for c in meta.get("commits", [])
        ],
    }
    return pr_info, files


def collect_from_local(base: str):
    merge_base = run(["git", "merge-base", base, "HEAD"]).strip()
    if not merge_base:
        sys.exit(f"error: {base} と HEAD の merge-base を解決できません")

    status_map = {
        "A": "added",
        "D": "removed",
        "M": "modified",
        "R": "renamed",
        "C": "copied",
    }
    status_by_path: dict[str, str] = {}
    for line in run(["git", "diff", "--name-status", merge_base, "HEAD"]).splitlines():
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        status_by_path[parts[-1]] = status_map.get(parts[0][0], "modified")

    files = []
    for line in run(["git", "diff", "--numstat", merge_base, "HEAD"]).splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        add_raw, del_raw, path = parts[0], parts[1], parts[-1]
        additions = 0 if add_raw == "-" else int(add_raw)
        deletions = 0 if del_raw == "-" else int(del_raw)
        files.append(
            build_file_entry(path, status_by_path.get(path, "modified"), additions, deletions)
        )

    branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"]).strip()
    commits = []
    for line in run(["git", "log", "--format=%h\t%s", f"{merge_base}..HEAD"]).splitlines():
        sha, _, message = line.partition("\t")
        commits.append({"sha": sha, "message": message})

    pr_info = {
        "mode": "local",
        "number": None,
        "title": f"{branch} ({base} からの差分)",
        "url": None,
        "author": None,
        "state": None,
        "is_draft": None,
        "base": base,
        "head": branch,
        "body": "",
        "commits": commits,
    }
    return pr_info, files


def summarize(files: list[dict]) -> dict:
    def tally(key: str) -> dict:
        counts: dict[str, int] = {}
        for f in files:
            value = f[key]
            if value is None:
                continue
            counts[value] = counts.get(value, 0) + 1
        return dict(sorted(counts.items(), key=lambda kv: -kv[1]))

    reviewable = [f for f in files if not f["generated"] and not f["noise"]]
    return {
        "total_files": len(files),
        "reviewable_files": len(reviewable),
        "generated_files": sum(1 for f in files if f["generated"]),
        "total_additions": sum(f["additions"] for f in files),
        "total_deletions": sum(f["deletions"] for f in files),
        "by_package": tally("package"),
        "by_layer": tally("layer"),
        "by_feature": tally("feature"),
        "top_churn": [
            {"path": f["path"], "churn": f["churn"], "layer": f["layer"]}
            for f in sorted(reviewable, key=lambda f: -f["churn"])[:15]
        ],
    }


def main() -> None:
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)

    os.chdir(run(["git", "rev-parse", "--show-toplevel"]).strip())

    if args[0] == "--local":
        base = args[1] if len(args) > 1 else "main"
        pr_info, files = collect_from_local(base)
    else:
        pr_info, files = collect_from_pr(args[0])

    files.sort(key=lambda f: (f["package"], f["layer"], f["path"]))

    output = {
        "generated_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "pr": pr_info,
        "summary": summarize(files),
        "files": files,
    }
    json.dump(output, sys.stdout, ensure_ascii=False, indent=2)
    print()


if __name__ == "__main__":
    main()
