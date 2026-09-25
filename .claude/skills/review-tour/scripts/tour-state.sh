#!/bin/bash
set -euo pipefail

# Usage:
#   ./tour-state.sh <tour-id> show                        進捗を表で出す
#   ./tour-state.sh <tour-id> next                        次に案内する観点を JSON で出す
#   ./tour-state.sh <tour-id> set <観点ID> <state>        観点の状態を更新する
#   ./tour-state.sh <tour-id> at <観点ID> <番号>          観点内で説明済みの立ち寄り先の番号を記録する
#
# state: candidate | pending | in_progress | done | skipped
#
# tour.json の viewpoints(問い・ルート・結論)はスキル本体(LLM)が書き込む。
# このスクリプトは状態遷移と現在地の記録だけを担当し、内容には触れない。

TOUR_ID=${1:?"Usage: $0 <tour-id> <show|next|set|at> ..."}
ACTION=${2:?"Usage: $0 <tour-id> <show|next|set|at> ..."}

cd "$(git rev-parse --show-toplevel)"
FILE="tmp/review-tour/${TOUR_ID}/tour.json"

if [[ ! -f "$FILE" ]]; then
  echo "error: $FILE がありません。先に init-tour.sh を実行してください。" >&2
  exit 1
fi

require_viewpoint() {
  if ! jq -e --arg id "$1" 'any(.viewpoints[]; .id == $id)' "$FILE" > /dev/null; then
    echo "error: 観点ID '$1' が tour.json にありません。" >&2
    jq -r '.viewpoints[] | "  \(.id)\t\(.state)\t\(.question)"' "$FILE" >&2
    exit 1
  fi
}

case "$ACTION" in
  show)
    jq -r '"ツアー: \(.tour_id)   比較: \(.source.base_sha[0:8])..\(.source.head_sha[0:8])"' "$FILE"
    echo
    # 見出しは column に通さない(タブが無い行が混ざると列幅がずれるため)。
    jq -r '
      (["観点ID", "状態", "現在地", "問い"] | @tsv),
      (["------", "----", "------", "----"] | @tsv),
      (.viewpoints[] | select(.state != "candidate") |
        [.id, .state, "\(.position // 0)/\(.route | length)", .question] | @tsv)
    ' "$FILE" | column -t -s $'\t'
    echo
    jq -r '
      [.viewpoints[] | select(.state != "candidate")] as $sel |
      "進捗: \([$sel[] | select(.state == "done" or .state == "skipped")] | length)/\($sel | length) 観点完了"
    ' "$FILE"
    CANDIDATES=$(jq -r '.viewpoints[] | select(.state == "candidate") | "  \(.id)  \(.question)"' "$FILE")
    if [[ -n "$CANDIDATES" ]]; then
      echo
      echo "未選択の候補:"
      echo "$CANDIDATES"
    fi
    ;;

  next)
    jq -c 'first(.viewpoints[] | select(.state == "in_progress" or .state == "pending")) // null' "$FILE"
    ;;

  set)
    VP_ID=${3:?"Usage: $0 <tour-id> set <観点ID> <state>"}
    STATE=${4:?"Usage: $0 <tour-id> set <観点ID> <state>"}
    case "$STATE" in
      candidate|pending|in_progress|done|skipped) ;;
      *) echo "error: 不正な state: $STATE (candidate|pending|in_progress|done|skipped)" >&2; exit 1 ;;
    esac
    require_viewpoint "$VP_ID"
    TMP=$(mktemp)
    jq --arg id "$VP_ID" --arg state "$STATE" --arg now "$(date +%Y-%m-%dT%H:%M:%S%z)" '
      .updated_at = $now |
      .viewpoints |= map(if .id == $id then .state = $state else . end)
    ' "$FILE" > "$TMP"
    mv "$TMP" "$FILE"
    jq -r --arg id "$VP_ID" '.viewpoints[] | select(.id == $id) | "\(.id): \(.state)"' "$FILE"
    ;;

  at)
    VP_ID=${3:?"Usage: $0 <tour-id> at <観点ID> <番号>"}
    POS=${4:?"Usage: $0 <tour-id> at <観点ID> <番号>"}
    if [[ ! "$POS" =~ ^[0-9]+$ ]]; then
      echo "error: 番号は 0 以上の整数で指定してください。" >&2
      exit 1
    fi
    require_viewpoint "$VP_ID"
    TMP=$(mktemp)
    jq --arg id "$VP_ID" --argjson pos "$POS" --arg now "$(date +%Y-%m-%dT%H:%M:%S%z)" '
      .updated_at = $now |
      .viewpoints |= map(if .id == $id then .position = $pos else . end)
    ' "$FILE" > "$TMP"
    mv "$TMP" "$FILE"
    jq -r --arg id "$VP_ID" '.viewpoints[] | select(.id == $id) | "\(.id): \(.position)/\(.route | length)"' "$FILE"
    ;;

  *)
    echo "error: 不明なアクション: $ACTION (show|next|set|at)" >&2
    exit 2
    ;;
esac
