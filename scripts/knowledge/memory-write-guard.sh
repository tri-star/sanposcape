#!/usr/bin/env bash
#
# agent-memory への書き込み直後に front-matter 規約を検査する PostToolUse フック。
#
# 規約: docs/knowledge-management.md
# 検査: scripts/knowledge/check-memory-frontmatter.py
#
# 違反時は exit 2 で stderr の内容がエージェントにフィードバックされ、その場で修正できる。
# agent-memory 以外への書き込みでは何もせず即座に終了する。

set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[[ -z "$ROOT" ]] && exit 0

PAYLOAD="$(cat)"

# agent-memory 以外の書き込みが大半なので、追加プロセスを起動する前に文字列で足切りする。
[[ "$PAYLOAD" != *agent-memory* ]] && exit 0

FILE_PATH="$(printf '%s' "$PAYLOAD" | python3 -c '
import json, sys
try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)
print(payload.get("tool_input", {}).get("file_path", ""))
' 2>/dev/null)"

case "$FILE_PATH" in
  */.claude/agent-memory/*.md) ;;
  *) exit 0 ;;
esac

[[ "$(basename "$FILE_PATH")" == "MEMORY.md" ]] && exit 0
[[ -f "$FILE_PATH" ]] || exit 0

if ! output="$(python3 "$ROOT/scripts/knowledge/check-memory-frontmatter.py" --enforce-all "$FILE_PATH" 2>&1)"; then
  echo "$output" >&2
  exit 2
fi

exit 0
