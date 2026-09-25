#!/bin/bash
set -euo pipefail

# Usage:
#   ./diff.sh <tour-id> [--stat] <path>...
#
# 指定したファイルの diff だけを取り出す。
# PR 全体の diff を一度に読むとコンテキストが尽きるため、
# 案内中は必ずこのスクリプトで「今の立ち寄り先のぶんだけ」読むこと。
#
# 比較する commit は init-tour.sh が tour.json に固定したものを使う。
# working tree は一切変更しない(checkout しない)。

TOUR_ID=${1:?"Usage: $0 <tour-id> [--stat] <path>..."}
shift

DIFF_OPTS=()
if [[ "${1:-}" == "--stat" ]]; then
  DIFF_OPTS+=(--stat)
  shift
fi

if [[ $# -eq 0 ]]; then
  echo "error: 対象ファイルを1つ以上指定してください。PR 全体の diff は読まない方針です。" >&2
  exit 2
fi

source "$(dirname "$0")/_source.sh"
load_source "$TOUR_ID"

git diff "${DIFF_OPTS[@]}" "$BASE_SHA" "$HEAD_SHA" -- "$@"
