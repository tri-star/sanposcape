#!/usr/bin/env bash
#
# 手元に溜まった agent-memory のアクセスログを、リポジトリの .claude/memory-access-log/ へ移す。
#
# record-memory-access.sh は作業ツリーの外（<git-common-dir>/memory-access-log/）に記録する。
# PR を作るとき（knowledge-harvest のコミット）にこのスクリプトで移してコミットすると、
# 別マシンでの作業分や他のメンバーの分とリポジトリ上で合算できる。
# 移した分は手元から消える。移した後に読んだ分は手元に残り、次の PR で移される。
#
# 移し先のファイル名は移すたびに一意にする（<YYYY-MM>/<session-id>.<移した時刻>-<乱数>.jsonl）。
# 手元の置き場所は全 worktree で共有されるため、同じセッションのログが別々のブランチへ移ることがある。
# 同じ名前のファイルに追記すると、それらの PR を後からマージしたときに add/add で衝突するため。
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

# 複数の worktree から同時に移さないよう、移し込み全体を排他にする。
# macOS（flock が無く bash 3.2）でも動くよう、mkdir の原子性でロックする。
LOCK="$SPOOL/.lock.d"
acquired=0
for _ in $(seq 1 150); do
  if mkdir "$LOCK" 2>/dev/null; then
    acquired=1
    break
  fi
  # 中断で残ったロック（10分以上前）は取り除いて取り直す。
  if [[ -n "$(find "$LOCK" -maxdepth 0 -mmin +10 2>/dev/null)" ]]; then
    rmdir "$LOCK" 2>/dev/null || true
    continue
  fi
  sleep 0.2
done
if [[ "$acquired" -ne 1 ]]; then
  echo "ロックを取れませんでした（他の移し込みが実行中）: $LOCK" >&2
  exit 1
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
moved=0
lines=0
# 中断で残った退避ファイル（*.jsonl.flushing.*）も対象にする（ロックの内側なので、残っているのは中断の残り）。
# 先に一覧を確定させる（ループ中に作る退避ファイルを find が拾わないように）。
files=()
while IFS= read -r -d '' found; do
  files+=("$found")
done < <(find "$SPOOL" -type f \( -name '*.jsonl' -o -name '*.jsonl.flushing.*' \) -print0)
for file in ${files[@]+"${files[@]}"}; do
  rel="${file#"$SPOOL"/}"
  rel="${rel%%.flushing.*}"            # <YYYY-MM>/<session>.jsonl
  case "$rel" in
    */*.jsonl) ;;
    *) continue ;;
  esac

  # 先に rename で退避する。フックがこの後に記録する分は新しいファイルに入り、次回に移される。
  # 退避の前にフックが開いていたファイルへの書き込みも、同じファイル（inode）ごと移すので失われない。
  if [[ "$file" == *.flushing.* ]]; then
    staging="$file"
  else
    staging="$file.flushing.$$"
    mv "$file" "$staging" 2>/dev/null || continue
  fi

  dest="$DEST/${rel%.jsonl}.$stamp-$RANDOM$RANDOM.jsonl"
  mkdir -p "$(dirname "$dest")"
  lines=$((lines + $(wc -l < "$staging")))
  mv "$staging" "$dest"
  moved=$((moved + 1))
done

echo "アクセスログを ${moved} ファイル（${lines} 行）移しました: $DEST"

if [[ "$STAGE" -eq 1 && "$moved" -gt 0 ]]; then
  git -C "$ROOT" add .claude/memory-access-log
fi
