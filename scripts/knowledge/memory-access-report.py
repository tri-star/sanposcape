#!/usr/bin/env python3
"""agent-memory のアクセスログを集計する。

record-memory-access.sh が .claude/memory-access-log/<YYYY-MM>/<session-id>.jsonl に
残した記録を読み、「どのメモリが実際に使われているか」を数値で出す。
棚卸し（削除・統合・ADR昇格）の判断材料に使う。

セッションごとにファイルが分かれているため、複数人のログをコミットしてもそのまま合算できる。

使い方:
    scripts/knowledge/memory-access-report.py              # 全期間
    scripts/knowledge/memory-access-report.py --days 30    # 直近30日
    scripts/knowledge/memory-access-report.py --agent mobile-developer
    scripts/knowledge/memory-access-report.py --json       # 機械処理向け
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

LOG_ROOT = Path(".claude/memory-access-log")
MEMORY_ROOT = Path(".claude/agent-memory")


def repo_root() -> Path:
    out = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=True,
    )
    return Path(out.stdout.strip())


def load_records(root: Path, since: datetime | None) -> list[dict]:
    records: list[dict] = []
    for path in sorted((root / LOG_ROOT).rglob("*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
                stamp = datetime.strptime(record["ts"], "%Y-%m-%dT%H:%M:%SZ").replace(
                    tzinfo=timezone.utc
                )
            except (json.JSONDecodeError, KeyError, ValueError):
                continue  # 壊れた行は無視する（計測がワークフローを止めないため）
            if since and stamp < since:
                continue
            record["_ts"] = stamp
            records.append(record)
    return records


def memory_files(root: Path) -> list[tuple[str, str]]:
    """(agent, memory-filename) の一覧。MEMORY.md は本文ではないので除く。"""
    return sorted(
        (path.parent.name, path.name)
        for path in (root / MEMORY_ROOT).rglob("*.md")
        if path.name != "MEMORY.md"
    )


def build_stats(records: list[dict], existing: list[tuple[str, str]]) -> list[dict]:
    reads: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for record in records:
        reads[(record.get("agent", ""), record.get("memory", ""))].append(record)

    stats = []
    for key in sorted(set(existing) | set(reads)):
        agent, memory = key
        hits = reads.get(key, [])
        stats.append(
            {
                "agent": agent,
                "memory": memory,
                "reads": len(hits),
                "sessions": len({h.get("session") for h in hits}),
                "last_read": max((h["_ts"] for h in hits), default=None),
                "exists": key in set(existing),
            }
        )
    return stats


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, help="直近N日に絞る")
    parser.add_argument("--agent", help="特定エージェントに絞る")
    parser.add_argument("--json", action="store_true", help="JSONで出力する")
    args = parser.parse_args(argv)

    root = repo_root()
    since = (
        datetime.now(timezone.utc) - timedelta(days=args.days) if args.days else None
    )

    records = load_records(root, since)
    existing = memory_files(root)
    stats = build_stats(records, existing)

    if args.agent:
        stats = [s for s in stats if s["agent"] == args.agent]

    if args.json:
        print(
            json.dumps(
                [
                    {**s, "last_read": s["last_read"].isoformat() if s["last_read"] else None}
                    for s in stats
                ],
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0

    if not records:
        print("アクセスログがまだありません。")
        print("PreToolUse フック (record-memory-access.sh) を有効にしてしばらく運用してください。")
        print(f"メモリ本文: {len(existing)} ファイル")
        return 0

    period = f"直近{args.days}日" if args.days else "全期間"
    sessions = len({r.get("session") for r in records})
    print(f"# agent-memory アクセス集計（{period} / {len(records)} 回 / {sessions} セッション）\n")

    used = [s for s in stats if s["reads"] > 0]
    unused = [s for s in stats if s["reads"] == 0 and s["exists"]]
    missing = [s for s in stats if not s["exists"]]

    print("## よく読まれているメモリ")
    for stat in sorted(used, key=lambda s: (-s["reads"], s["agent"]))[:20]:
        last = stat["last_read"].strftime("%Y-%m-%d")
        print(
            f"  {stat['reads']:3d}回 / {stat['sessions']:2d}セッション  "
            f"最終 {last}  {stat['agent']}/{stat['memory']}"
        )

    print(f"\n## 一度も読まれていないメモリ（{len(unused)} 件 / 削除・統合の候補）")
    by_agent: dict[str, list[str]] = defaultdict(list)
    for stat in unused:
        by_agent[stat["agent"]].append(stat["memory"])
    for agent in sorted(by_agent):
        print(f"  {agent} ({len(by_agent[agent])}件)")
        for memory in sorted(by_agent[agent]):
            print(f"    - {memory}")

    if missing:
        print(f"\n## 削除済みだが読まれた記録が残るメモリ（{len(missing)} 件）")
        for stat in sorted(missing, key=lambda s: -s["reads"]):
            print(f"  {stat['reads']:3d}回  {stat['agent']}/{stat['memory']}")

    total = len(existing)
    rate = len(used) / total * 100 if total else 0
    print(f"\n利用率: {len(used)}/{total} ファイル ({rate:.0f}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
