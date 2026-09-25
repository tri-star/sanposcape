#!/bin/bash
# diff.sh / show-file.sh から source する共通処理。単体では実行しない。
#
# load_source <tour-id> を呼ぶと、tour.json の .source から次の変数を設定する。
#   TOUR_DIR  作業フォルダ
#   MODE      pr | local
#   NUMBER    PR 番号(local の場合は空)
#   REPO      owner/name(GitHub の固定リンク用。local の場合は空)
#   BASE_SHA  比較の起点(merge-base)
#   HEAD_SHA  比較の終点(init-tour.sh で固定した PR head)
#
# commit を init-tour.sh の時点で固定しているのは、レビュー中に PR へ push されても
# 説明済みの file:line がずれないようにするため。

load_source() {
  local tour_id=$1
  cd "$(git rev-parse --show-toplevel)"
  TOUR_DIR="tmp/review-tour/${tour_id}"
  local tour_json="${TOUR_DIR}/tour.json"

  if [[ ! -f "$tour_json" ]]; then
    echo "error: $tour_json がありません。先に init-tour.sh を実行してください。" >&2
    exit 1
  fi

  MODE=$(jq -r '.source.mode // empty' "$tour_json")
  NUMBER=$(jq -r '.source.number // empty' "$tour_json")
  REPO=$(jq -r '.source.repo // empty' "$tour_json")
  BASE_SHA=$(jq -r '.source.base_sha // empty' "$tour_json")
  HEAD_SHA=$(jq -r '.source.head_sha // empty' "$tour_json")

  if [[ -z "$MODE" || -z "$BASE_SHA" || -z "$HEAD_SHA" ]]; then
    echo "error: tour.json の .source が不完全です。init-tour.sh を --refresh 付きで実行し直してください。" >&2
    exit 1
  fi

  # 別の clone や gc の後で object が無い場合に備え、PR モードなら取り直す。
  if ! git cat-file -e "${HEAD_SHA}^{commit}" 2>/dev/null; then
    if [[ "$MODE" == "pr" ]]; then
      git fetch --quiet origin "refs/pull/${NUMBER}/head" 2>/dev/null || true
    fi
    if ! git cat-file -e "${HEAD_SHA}^{commit}" 2>/dev/null; then
      echo "error: commit ${HEAD_SHA} が見つかりません。init-tour.sh --refresh で取り直してください。" >&2
      exit 1
    fi
  fi
}
