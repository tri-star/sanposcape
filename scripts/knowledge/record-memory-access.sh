#!/usr/bin/env bash
#
# agent-memory の本文が読まれたことを記録する PreToolUse フック。
#
# 「そのメモリが実際に役に立ったか」を感覚ではなく数値で見るための計測。
# 記録先は .claude/memory-access-log/<YYYY-MM>/<session-id>.jsonl。
# セッションごとに別ファイルへ追記するため、複数人がコミットしても衝突しない。
#
# 集計: scripts/knowledge/memory-access-report.py
#
# このフックは計測専用で、いかなる場合もツール実行を妨げない（常に exit 0）。

set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[[ -z "$ROOT" ]] && exit 0

PAYLOAD="$(cat)"

# agent-memory 以外の読み取りが大半なので、追加プロセスを起動する前に足切りする。
[[ "$PAYLOAD" != *agent-memory* ]] && exit 0

printf '%s' "$PAYLOAD" | ROOT="$ROOT" python3 -c '
import json, os, re, sys
from datetime import datetime, timezone
from pathlib import Path

try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)

file_path = payload.get("tool_input", {}).get("file_path", "")
match = re.search(r"\.claude/agent-memory/([^/]+)/(.+\.md)$", file_path)
if not match:
    sys.exit(0)

agent, memory = match.group(1), match.group(2)

# セッションIDはそのままファイル名に使うため、安全な文字だけに落とす。
session = re.sub(r"[^A-Za-z0-9_-]", "", str(payload.get("session_id", "unknown"))) or "unknown"

now = datetime.now(timezone.utc)
log_dir = Path(os.environ["ROOT"]) / ".claude" / "memory-access-log" / now.strftime("%Y-%m")
log_dir.mkdir(parents=True, exist_ok=True)

record = {
    "ts": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    "session": session,
    "agent": agent,
    "memory": memory,
    "via": payload.get("tool_name", ""),
}

# 1行ずつの追記なので、同一セッション内の並行書き込みでも行が壊れにくい。
with (log_dir / f"{session}.jsonl").open("a", encoding="utf-8") as handle:
    handle.write(json.dumps(record, ensure_ascii=False) + "\n")
' 2>/dev/null

exit 0
