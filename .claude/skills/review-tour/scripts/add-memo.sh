#!/bin/bash
set -euo pipefail

# Usage:
#   ./add-memo.sh <pr-number> [--chapter <章ID>] "メモ本文"
#   echo "長文メモ" | ./add-memo.sh <pr-number> [--chapter <章ID>]
#
# memo.md へ日時付きで追記する。指摘事項ではない「後で見返したいこと」用。

TOUR_ID=${1:?"Usage: $0 <pr-number> [--chapter <id>] <本文>"}
shift

CHAPTER=""
if [[ "${1:-}" == "--chapter" ]]; then
  CHAPTER="$2"
  shift 2
fi

BODY="${1:-}"
if [[ -z "$BODY" && ( -p /dev/stdin || -f /dev/stdin ) ]]; then
  BODY=$(cat)
fi
: "${BODY:?メモ本文が空です}"

cd "$(git rev-parse --show-toplevel)"
FILE="tmp/review-tour/${TOUR_ID}/memo.md"

if [[ ! -f "$FILE" ]]; then
  echo "error: $FILE がありません。先に init-tour.sh を実行してください。" >&2
  exit 1
fi

HEADING="## $(date +%Y-%m-%d\ %H:%M)"
[[ -n "$CHAPTER" ]] && HEADING="${HEADING} — ${CHAPTER}"

{
  echo
  echo "$HEADING"
  echo
  echo "$BODY"
} >> "$FILE"

echo "メモを ${FILE} に追記しました。"
