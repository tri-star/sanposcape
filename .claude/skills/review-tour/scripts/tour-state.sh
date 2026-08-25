#!/bin/bash
set -euo pipefail

# Usage:
#   ./tour-state.sh <pr-number> show                 進捗を表で出す
#   ./tour-state.sh <pr-number> next                 次に説明する章を JSON で出す
#   ./tour-state.sh <pr-number> set <章ID> <state>   章の状態を更新する
#
# state: pending | in_progress | done | skipped
#
# tour.json の chapters はスキル本体(LLM)が章立て時に書き込む。
# このスクリプトは状態遷移だけを担当し、章の内容には触れない。

TOUR_ID=${1:?"Usage: $0 <pr-number> <show|next|set> ..."}
ACTION=${2:?"Usage: $0 <pr-number> <show|next|set> ..."}

cd "$(git rev-parse --show-toplevel)"
FILE="tmp/review-tour/${TOUR_ID}/tour.json"

if [[ ! -f "$FILE" ]]; then
  echo "error: $FILE がありません。先に init-tour.sh を実行してください。" >&2
  exit 1
fi

case "$ACTION" in
  show)
    # 見出しは column に通さない(タブが無い行が混ざると列幅がずれるため)。
    jq -r '"ツアー: \(.tour_id)   順序: \(.order_strategy // "未決定")"' "$FILE"
    echo
    jq -r '
      (["#", "章ID", "状態", "ファイル数", "タイトル"] | @tsv),
      (["-", "----", "----", "--------", "--------"] | @tsv),
      (.chapters | to_entries[] |
        [(.key + 1 | tostring), .value.id, .value.state, (.value.files | length | tostring), .value.title] | @tsv)
    ' "$FILE" | column -t -s $'\t'
    echo
    jq -r '
      "進捗: \([.chapters[] | select(.state == "done")] | length)/\(.chapters | length) 章完了" +
      " (スキップ \([.chapters[] | select(.state == "skipped")] | length))"
    ' "$FILE"
    ;;

  next)
    jq -c 'first(.chapters[] | select(.state == "pending" or .state == "in_progress")) // null' "$FILE"
    ;;

  set)
    CHAPTER_ID=${3:?"Usage: $0 <pr-number> set <章ID> <state>"}
    STATE=${4:?"Usage: $0 <pr-number> set <章ID> <state>"}
    case "$STATE" in
      pending|in_progress|done|skipped) ;;
      *) echo "error: 不正な state: $STATE (pending|in_progress|done|skipped)" >&2; exit 1 ;;
    esac

    if ! jq -e --arg id "$CHAPTER_ID" 'any(.chapters[]; .id == $id)' "$FILE" > /dev/null; then
      echo "error: 章ID '$CHAPTER_ID' が tour.json にありません。" >&2
      jq -r '.chapters[].id' "$FILE" >&2
      exit 1
    fi

    TMP=$(mktemp)
    jq --arg id "$CHAPTER_ID" --arg state "$STATE" --arg now "$(date +%Y-%m-%dT%H:%M:%S%z)" '
      .updated_at = $now
      | .chapters = [.chapters[] | if .id == $id then .state = $state else . end]
    ' "$FILE" > "$TMP"
    mv "$TMP" "$FILE"
    echo "$CHAPTER_ID -> $STATE"
    ;;

  *)
    echo "error: 不明なアクション: $ACTION (show|next|set)" >&2
    exit 1
    ;;
esac
