#!/usr/bin/env bash
#
# 手元に溜まった agent-memory のアクセスログを、リポジトリの .claude/memory-access-log/ へ移す。
#
# record-memory-access.sh は作業ツリーの外（<git-common-dir>/memory-access-log/）に記録する。
# PR を作るとき（knowledge-harvest のコミット）にこのスクリプトで移してコミットすると、
# 別マシンでの作業分や他のメンバーの分とリポジトリ上で合算できる。
# 移した分は手元から消える。移した後に読んだ分は手元に残り、次の PR で移される。
#
# 使い方:
#   scripts/knowledge/flush-memory-access-log.sh           # 移す（git add はしない）
#   scripts/knowledge/flush-memory-access-log.sh --stage   # 移して git add まで行う
#
# 規約: docs/knowledge-management.md「計測（どのメモリが役に立ったか）」

set -euo pipefail

STAGE=0
if [[ "${1:-}" == "--stage" ]]; then
  STAGE=1
elif [[ -n "${1:-}" ]]; then
  echo "usage: $0 [--stage]" >&2
  exit 2
fi

ROOT="$(git rev-parse --show-toplevel)"
SPOOL="$(git rev-parse --path-format=absolute --git-common-dir)/memory-access-log"
DEST="$ROOT/.claude/memory-access-log"

if [[ ! -d "$SPOOL" ]]; then
  echo "移すログはありません（$SPOOL が無い）"
  exit 0
fi

moved=0
lines=0
# 中断で残った退避ファイル（*.jsonl.flushing.*）も対象にする。
while IFS= read -r -d '' file; do
  rel="${file#"$SPOOL"/}"
  rel="${rel%%.flushing.*}"            # <YYYY-MM>/<session>.jsonl
  case "$rel" in
    */*.jsonl) ;;
    *) continue ;;
  esac

  # 先に rename で退避する。フックがこの後に追記する分は新しいファイルに入り、次回に移される。
  if [[ "$file" == *.flushing.* ]]; then
    staging="$file"
  else
    staging="$file.flushing.$$"
    mv "$file" "$staging"
  fi

  mkdir -p "$DEST/$(dirname "$rel")"
  # 同じセッションを前回も移していれば、そのファイルの末尾に追記する。
  cat "$staging" >> "$DEST/$rel"
  lines=$((lines + $(wc -l < "$staging")))
  rm -f "$staging"
  moved=$((moved + 1))
done < <(find "$SPOOL" -type f \( -name '*.jsonl' -o -name '*.jsonl.flushing.*' \) -print0)

# 空になった月のディレクトリを片付ける。
find "$SPOOL" -mindepth 1 -type d -empty -delete 2>/dev/null || true

echo "アクセスログを ${moved} ファイル（${lines} 行）移しました: $DEST"

if [[ "$STAGE" -eq 1 && "$moved" -gt 0 ]]; then
  git -C "$ROOT" add .claude/memory-access-log
fi
