#!/bin/bash
set -euo pipefail

# Usage:
#   ./show-file.sh <tour-id> <path> [<start> [<end>]]
#
# PR head 版のファイルを行番号付きで表示する。
# PR モードでは作業ツリー(多くは main)と PR の中身が一致しないため、
# 変更後のコードは Read ではなくこのスクリプトで読むこと。
# 案内で示す file:line はここで表示される行番号に揃える。
#
# 先頭行に GitHub の固定リンク(commit 固定)を出す。ユーザーがブラウザで同じ箇所を開けるようにするため。
# PR head に存在しないファイル(PR で削除されたもの)は base 版を表示する。

TOUR_ID=${1:?"Usage: $0 <tour-id> <path> [<start> [<end>]]"}
FILE_PATH=${2:?"Usage: $0 <tour-id> <path> [<start> [<end>]]"}
START=${3:-1}
END=${4:-}

if [[ ! "$START" =~ ^[0-9]+$ || ( -n "$END" && ! "$END" =~ ^[0-9]+$ ) ]]; then
  echo "error: 行番号は正の整数で指定してください。" >&2
  exit 2
fi

source "$(dirname "$0")/_source.sh"
load_source "$TOUR_ID"

REF=$HEAD_SHA
LABEL="PR head"
[[ "$MODE" == "local" ]] && LABEL="branch head"
if ! git cat-file -e "${HEAD_SHA}:${FILE_PATH}" 2>/dev/null; then
  if git cat-file -e "${BASE_SHA}:${FILE_PATH}" 2>/dev/null; then
    REF=$BASE_SHA
    LABEL="base（PR head には存在しない＝この PR で削除または移動）"
  else
    echo "error: ${FILE_PATH} は PR head にも base にもありません。" >&2
    exit 1
  fi
fi

TOTAL=$(git show "${REF}:${FILE_PATH}" | wc -l)
END=${END:-$TOTAL}

echo "# ${FILE_PATH} @ ${REF:0:8} (${LABEL}) L${START}-L${END} / 全${TOTAL}行"
if [[ -n "$REPO" ]]; then
  echo "# https://github.com/${REPO}/blob/${REF}/${FILE_PATH}#L${START}-L${END}"
fi

git show "${REF}:${FILE_PATH}" | awk -v s="$START" -v e="$END" 'NR >= s && NR <= e { printf "%5d\t%s\n", NR, $0 }'
