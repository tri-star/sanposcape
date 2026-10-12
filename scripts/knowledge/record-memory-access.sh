#!/usr/bin/env bash
#
# agent-memory の本文が読まれたことを記録する PreToolUse フック（Read / Bash）。
#
# 「そのメモリが実際に役に立ったか」を感覚ではなく数値で見るための計測。
# 記録先は作業ツリーの外、git の共通ディレクトリ配下の
#   <git-common-dir>/memory-access-log/<YYYY-MM>/<session-id>.jsonl
# 同じ clone の worktree はここを共有する。作業ツリーに未コミットのファイルを作らないため、
# 作業の途中や PR 作成の後にメモリを読んでも作業ツリーは汚れない。
# 溜まったログは PR 作成時に scripts/knowledge/flush-memory-access-log.sh で
# .claude/memory-access-log/ へ移してコミットし、別マシン・他のメンバーの分と合算できるようにする。
#
# Bash での読み取りは、コマンドに含まれる agent-memory のパスと読み取り系のコマンド名から推定する（近似）。
#
# 集計: scripts/knowledge/memory-access-report.py
#
# このフックは計測専用で、いかなる場合もツール実行を妨げない（常に exit 0）。

set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[[ -z "$ROOT" ]] && exit 0

PAYLOAD="$(cat)"

# agent-memory 以外の操作が大半なので、追加プロセスを起動する前に足切りする。
[[ "$PAYLOAD" != *agent-memory* ]] && exit 0

SPOOL_BASE="$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"
[[ -z "$SPOOL_BASE" ]] && exit 0

printf '%s' "$PAYLOAD" | SPOOL="$SPOOL_BASE/memory-access-log" python3 -c '
import json, os, re, sys
from datetime import datetime, timezone
from pathlib import Path

try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)

tool = payload.get("tool_name", "")
tool_input = payload.get("tool_input", {}) or {}
memory_path = re.compile(r"\.claude/agent-memory/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+\.md)")

hits: list[tuple[str, str]] = []
if tool == "Read":
    match = re.search(memory_path.pattern + r"$", tool_input.get("file_path", ""))
    if match:
        hits.append((match.group(1), match.group(2)))
elif tool == "Bash":
    command = tool_input.get("command", "")
    # 書き込み・移動（git mv / rm、sed -i、リダイレクト先など）まで数えないよう、
    # 読み取り系のコマンド名を含むときだけ記録する。完全には区別できない近似。
    if re.search(r"(^|[\s;&|(])(cat|head|tail|less|more|bat|nl|sed|awk)\s", command):
        hits.extend(dict.fromkeys(memory_path.findall(command)))

if not hits:
    sys.exit(0)

# セッションIDはそのままファイル名に使うため、安全な文字だけに落とす。
session = re.sub(r"[^A-Za-z0-9_-]", "", str(payload.get("session_id", "unknown"))) or "unknown"

now = datetime.now(timezone.utc)
log_dir = Path(os.environ["SPOOL"]) / now.strftime("%Y-%m")
log_dir.mkdir(parents=True, exist_ok=True)

# 1行ずつの追記なので、同一セッション内の並行書き込みでも行が壊れにくい。
with (log_dir / f"{session}.jsonl").open("a", encoding="utf-8") as handle:
    for agent, memory in hits:
        record = {
            "ts": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "session": session,
            "agent": agent,
            "memory": memory,
            "via": tool,
        }
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
' 2>/dev/null

exit 0
