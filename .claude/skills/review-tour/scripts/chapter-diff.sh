#!/bin/bash
set -euo pipefail

# Usage:
#   ./chapter-diff.sh <pr-number> [--stat] <path>...
#
# 章に属するファイルの diff だけを取り出す。
# PR 全体の diff を一度に読むとコンテキストが尽きるため、
# ツアー中は必ずこのスクリプトで「今の章のぶんだけ」読むこと。
#
# 参照する ref は tmp/review-tour/<PR番号>/tour.json の .source から解決する。
#   {"mode": "pr",    "number": 123, "base": "main"}   -> refs/pull/123/head を fetch して比較
#   {"mode": "local", "base": "main"}                  -> merge-base(base, HEAD) と HEAD を比較
#
# PR モードでは working tree を一切変更しない(checkout しない)。

TOUR_ID=${1:?"Usage: $0 <pr-number> [--stat] <path>..."}
shift

DIFF_OPTS=()
if [[ "${1:-}" == "--stat" ]]; then
  DIFF_OPTS+=(--stat)
  shift
fi

if [[ $# -eq 0 ]]; then
  echo "error: 対象ファイルを1つ以上指定してください。" >&2
  exit 2
fi

cd "$(git rev-parse --show-toplevel)"
TOUR_JSON="tmp/review-tour/${TOUR_ID}/tour.json"

if [[ ! -f "$TOUR_JSON" ]]; then
  echo "error: $TOUR_JSON がありません。先に init-tour.sh を実行してください。" >&2
  exit 1
fi

MODE=$(jq -r '.source.mode // empty' "$TOUR_JSON")
BASE=$(jq -r '.source.base // "main"' "$TOUR_JSON")

if [[ -z "$MODE" ]]; then
  echo "error: tour.json の .source が未設定です。章立て時に mode/base/number を書き込んでください。" >&2
  exit 1
fi

case "$MODE" in
  pr)
    NUMBER=$(jq -r '.source.number // empty' "$TOUR_JSON")
    : "${NUMBER:?tour.json の .source.number が未設定です}"
    # working tree を汚さずに PR の head を取得する。
    git fetch --quiet origin "refs/pull/${NUMBER}/head" 2>/dev/null || {
      echo "error: PR #${NUMBER} の head を fetch できません。" >&2
      exit 1
    }
    HEAD_REF=$(git rev-parse FETCH_HEAD)
    BASE_REF=$(git merge-base "origin/${BASE}" "$HEAD_REF" 2>/dev/null || git merge-base "$BASE" "$HEAD_REF")
    ;;
  local)
    HEAD_REF=HEAD
    BASE_REF=$(git merge-base "$BASE" HEAD)
    ;;
  *)
    echo "error: 不正な .source.mode: $MODE (pr|local)" >&2
    exit 1
    ;;
esac

git diff "${DIFF_OPTS[@]}" "$BASE_REF" "$HEAD_REF" -- "$@"
