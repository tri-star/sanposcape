#!/bin/bash
set -euo pipefail

# Usage: ./init-tour.sh <pr-number|slug>
#
# tmp/review-tour/<PR番号>/ にツアーの作業フォルダを用意する。
# 既にある場合は上書きせず、進捗を出力して再開できるようにする(冪等)。
#
# 出力(JSON):
#   {"dir": "...", "existing": true, "chapters": {"total": 5, "done": 2, ...}, "next": {...}}

TOUR_ID=${1:?"Usage: $0 <pr-number|slug>"}

if [[ ! "$TOUR_ID" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "error: ツアーIDに使えない文字が含まれています: $TOUR_ID" >&2
  exit 1
fi

cd "$(git rev-parse --show-toplevel)"

DIR="tmp/review-tour/${TOUR_ID}"
EXISTING=false
[[ -f "$DIR/tour.json" ]] && EXISTING=true

mkdir -p "$DIR/chapters"

if [[ ! -f "$DIR/tour.json" ]]; then
  jq -n --arg id "$TOUR_ID" --arg now "$(date +%Y-%m-%dT%H:%M:%S%z)" '{
    tour_id: $id,
    created_at: $now,
    updated_at: $now,
    order_strategy: null,
    order_reason: null,
    source: null,
    chapters: []
  }' > "$DIR/tour.json"
fi

if [[ ! -f "$DIR/review.md" ]]; then
  cat > "$DIR/review.md" <<'TEMPLATE'
# レビュー指摘事項

`add-finding.sh` が追記する。手で編集する場合も ID の連番を崩さないこと。

- severity: `high`(マージ前に対応) / `medium`(対応を推奨) / `low`(任意) / `info`(質問・確認)
- state: `open` / `resolved` / `wontfix`

TEMPLATE
fi

if [[ ! -f "$DIR/memo.md" ]]; then
  cat > "$DIR/memo.md" <<'TEMPLATE'
# レビューメモ

ツアー中に「後で見返したい」と思ったことを残す場所。
指摘事項ではないもの(仕様の理解・疑問・調べたいこと)はこちらへ。

TEMPLATE
fi

TOTAL=$(jq '.chapters | length' "$DIR/tour.json")
DONE=$(jq '[.chapters[] | select(.state == "done")] | length' "$DIR/tour.json")
SKIPPED=$(jq '[.chapters[] | select(.state == "skipped")] | length' "$DIR/tour.json")
NEXT=$(jq -c 'first(.chapters[] | select(.state == "pending" or .state == "in_progress")) // null' "$DIR/tour.json")
FINDINGS=$(grep -c '^### F-' "$DIR/review.md" 2>/dev/null || true)

jq -n \
  --arg dir "$DIR" \
  --argjson existing "$EXISTING" \
  --argjson total "$TOTAL" \
  --argjson done_count "$DONE" \
  --argjson skipped "$SKIPPED" \
  --argjson next "$NEXT" \
  --argjson findings "${FINDINGS:-0}" \
  '{
     dir: $dir,
     existing: $existing,
     chapters: {total: $total, done: $done_count, skipped: $skipped},
     findings: $findings,
     next: $next
   }'
