#!/usr/bin/env bash
#
# tmp/ 配下の古い作業ファイルを掃除する。
#
# tmp/ はチケット完了後にメンテナンスされないため、放置すると必ず陳腐化し、
# 後続のエージェントが古いプランやレビュー結果を読むノイズになる。
#
# 既定は dry-run で、実際に削除するには --apply を付ける。
#
# 使い方:
#   scripts/knowledge/gc-tmp.sh                      # 削除候補を表示（既定30日）
#   scripts/knowledge/gc-tmp.sh --days 14            # 保持期間を変える
#   scripts/knowledge/gc-tmp.sh --keep SS-60         # 明示的に残す（複数指定可）
#   scripts/knowledge/gc-tmp.sh --apply              # 実際に削除する
#
# 安全装置:
#   - git 管理下のファイルから参照されている tmp/ は削除しない（リンク切れ防止）
#   - 現在のブランチ名から推測したチケットIDは自動的に保持する

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

DAYS=30
APPLY=0
KEEP=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --days) DAYS="$2"; shift 2 ;;
    --keep) KEEP+=("$(echo "$2" | tr '[:lower:]' '[:upper:]')"); shift 2 ;;
    --apply) APPLY=1; shift ;;
    *) echo "不明な引数: $1" >&2; exit 2 ;;
  esac
done

[[ -d tmp ]] || { echo "tmp/ がありません。掃除するものはありません。"; exit 0; }

# 現在のブランチ名からチケットIDを拾う（例: tri-star/ss-60 -> SS-60）。
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
current_issue="$(echo "$branch" | grep -oiE '[a-z]{2,5}-[0-9]+' | head -1 | tr '[:lower:]' '[:upper:]' || true)"
if [[ -n "$current_issue" ]]; then
  KEEP+=("$current_issue")
  echo "現在のブランチ ($branch) から $current_issue を保持対象にしました。"
fi

# git 管理下のファイルから参照されている tmp/ 配下の名前を集める。
# 参照されているものを消すとリンク切れになるため保持する。
referenced="$(git grep -hoE 'tmp/[A-Za-z0-9._-]+' -- . 2>/dev/null | sed 's#^tmp/##' | sort -u || true)"

now="$(date +%s)"
threshold=$(( DAYS * 86400 ))

to_delete=()
kept=0

echo
printf '%-28s %8s %10s  %s\n' "対象" "経過日数" "サイズ" "判定"
printf '%-28s %8s %10s  %s\n' "----" "--------" "------" "----"

while IFS= read -r entry; do
  name="$(basename "$entry")"
  mtime="$(stat -c %Y "$entry")"
  age_days=$(( (now - mtime) / 86400 ))
  size="$(du -sh "$entry" | cut -f1)"

  reason=""
  upper_name="$(echo "$name" | tr '[:lower:]' '[:upper:]')"

  for keep in "${KEEP[@]:-}"; do
    [[ "$upper_name" == "$keep" || "$upper_name" == "$keep."* ]] && reason="保持(明示指定)"
  done

  if [[ -z "$reason" ]] && echo "$referenced" | grep -qxF "$name"; then
    reason="保持(git管理下から参照あり)"
  fi

  if [[ -z "$reason" ]] && (( now - mtime < threshold )); then
    reason="保持(${DAYS}日以内)"
  fi

  if [[ -z "$reason" ]]; then
    reason="削除"
    to_delete+=("$entry")
  else
    kept=$(( kept + 1 ))
  fi

  printf '%-28s %8s %10s  %s\n' "$name" "$age_days" "$size" "$reason"
done < <(find tmp -mindepth 1 -maxdepth 1 | sort)

echo
if [[ ${#to_delete[@]} -eq 0 ]]; then
  echo "削除対象はありません（保持: ${kept} 件）。"
  exit 0
fi

echo "削除対象: ${#to_delete[@]} 件 / 保持: ${kept} 件"

if [[ "$APPLY" -eq 0 ]]; then
  echo
  echo "これは dry-run です。実際に削除するには --apply を付けてください。"
  echo "削除前に、残すべき知識が ADR / agent-memory に移されているか確認してください"
  echo "（チケット単位の仕分けは knowledge-harvest skill が行います）。"
  exit 0
fi

for entry in "${to_delete[@]}"; do
  rm -rf "$entry"
  echo "削除: $entry"
done
echo "完了しました。"
