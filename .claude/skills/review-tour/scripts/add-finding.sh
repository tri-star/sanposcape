#!/bin/bash
set -euo pipefail

# Usage:
#   ./add-finding.sh <pr-number> --severity high --file path.py:88 --by agent \
#       --title "例外時にレコードが中途半端に残る" [--chapter 03-walk-usecase] [--body "..."]
#
# review.md へ ID を採番して追記する。
# LLM が Edit で既存の指摘を壊すのを防ぐため、追記は必ずこのスクリプトを通す。
# --body を省略した場合は標準入力を本文として読む(長文向け)。

TOUR_ID=${1:?"Usage: $0 <pr-number> --severity ... --file ... --by ... --title ..."}
shift

SEVERITY=""
FILE_REF=""
BY=""
CHAPTER=""
TITLE=""
BODY=""
BODY_SET=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --severity) SEVERITY="$2"; shift 2 ;;
    --file)     FILE_REF="$2"; shift 2 ;;
    --by)       BY="$2"; shift 2 ;;
    --chapter)  CHAPTER="$2"; shift 2 ;;
    --title)    TITLE="$2"; shift 2 ;;
    --body)     BODY="$2"; BODY_SET=1; shift 2 ;;
    *) echo "error: 不明な引数: $1" >&2; exit 2 ;;
  esac
done

: "${SEVERITY:?--severity は必須です (high|medium|low|info)}"
: "${FILE_REF:?--file は必須です (例: packages/backend/src/.../service.py:88)}"
: "${BY:?--by は必須です (agent|user)}"
: "${TITLE:?--title は必須です}"

case "$SEVERITY" in
  high|medium|low|info) ;;
  *) echo "error: 不正な severity: $SEVERITY (high|medium|low|info)" >&2; exit 1 ;;
esac
case "$BY" in
  agent|user) ;;
  *) echo "error: 不正な by: $BY (agent|user)" >&2; exit 1 ;;
esac

cd "$(git rev-parse --show-toplevel)"
FILE="tmp/review-tour/${TOUR_ID}/review.md"

if [[ ! -f "$FILE" ]]; then
  echo "error: $FILE がありません。先に init-tour.sh を実行してください。" >&2
  exit 1
fi

if [[ $BODY_SET -eq 0 && ( -p /dev/stdin || -f /dev/stdin ) ]]; then
  BODY=$(cat)
fi

NEXT_ID=$(printf 'F-%03d' "$(( $(grep -c '^### F-' "$FILE" || true) + 1 ))")

{
  echo
  echo "### ${NEXT_ID} [${SEVERITY}] ${TITLE}"
  echo
  echo "- **場所**: \`${FILE_REF}\`"
  echo "- **発見者**: ${BY}"
  [[ -n "$CHAPTER" ]] && echo "- **章**: ${CHAPTER}"
  echo "- **状態**: open"
  echo "- **記録日時**: $(date +%Y-%m-%dT%H:%M:%S%z)"
  if [[ -n "$BODY" ]]; then
    echo
    echo "$BODY"
  fi
} >> "$FILE"

echo "${NEXT_ID} を ${FILE} に追記しました。"
