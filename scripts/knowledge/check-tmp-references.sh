#!/usr/bin/env bash
#
# 恒久ドキュメント層から揮発層(tmp/)への参照を検出する。
#
# tmp/ は .gitignore 対象のため、恒久ドキュメント(ADR・docs・agent-memory)が
# tmp/ 配下を参照していると、別環境・別担当者・時間経過でリンク切れになる。
# 参照が必要な内容は tmp/ に置いたままにせず、ADR か docs へ昇格させること。
#
# 使い方:
#   scripts/knowledge/check-tmp-references.sh            # 検査 (違反があれば exit 1)
#   scripts/knowledge/check-tmp-references.sh --baseline # ベースラインを再生成
#
# 例外の書き方: 該当行に `tmp-ref-ok` を含むコメントを添える。
#   例: <!-- tmp-ref-ok: tmp/ の運用ルール自体を説明している箇所 -->

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

BASELINE_FILE="scripts/knowledge/tmp-reference-baseline.txt"

# 検査対象 = 恒久ドキュメント層。
# .claude/agents/ と .claude/skills/ は「tmp/<issue-id> を作業ディレクトリとして使え」という
# ワークフロー定義そのもののため対象外（参照ではなく生成の指示）。
SCAN_PATHSPECS=(
  "docs"
  "packages/*/docs"
  ".claude/agent-memory"
  ":(glob)*.md"
)

# プロジェクトルート相対の tmp/ のみを対象にする。
# /tmp/ (システムのtemp)、$TMPDIR、foo.tmp/ などは除外される。
PATTERN='(^|[^/[:alnum:]_.-])tmp/[[:alnum:]._-]|<project-root>/tmp/'

collect_violations() {
  git ls-files -z --cached --others --exclude-standard -- "${SCAN_PATHSPECS[@]}" \
    | grep -z '\.md$' \
    | xargs -0 grep -nE "$PATTERN" 2>/dev/null \
    | grep -v 'tmp-ref-ok' \
    || true
}

violating_files() {
  collect_violations | cut -d: -f1 | sort -u
}

if [[ "${1:-}" == "--baseline" ]]; then
  {
    echo "# tmp/ 参照の既知違反（棚卸しで ADR/docs へ昇格させ、減らしていく対象）"
    echo "# 再生成: scripts/knowledge/check-tmp-references.sh --baseline"
    echo "# ここに無いファイルで新たに tmp/ 参照が発生した場合、CIが失敗する。"
    violating_files
  } > "$BASELINE_FILE"
  echo "ベースラインを更新しました: $BASELINE_FILE ($(violating_files | wc -l) ファイル)"
  exit 0
fi

baseline_entries() {
  [[ -f "$BASELINE_FILE" ]] && grep -v '^#' "$BASELINE_FILE" | grep -v '^[[:space:]]*$' || true
}

all_violating=$(violating_files)
baseline=$(baseline_entries)

new_violations=$(comm -23 <(echo "$all_violating" | sort) <(echo "$baseline" | sort) | grep -v '^$' || true)
fixed=$(comm -13 <(echo "$all_violating" | sort) <(echo "$baseline" | sort) | grep -v '^$' || true)

remaining_count=$(echo "$all_violating" | grep -cv '^$' || true)
baseline_count=$(echo "$baseline" | grep -cv '^$' || true)

if [[ -n "$new_violations" ]]; then
  echo "❌ 恒久ドキュメントから tmp/ への新規参照が見つかりました。" >&2
  echo >&2
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    grep -nE "$PATTERN" "$f" | grep -v 'tmp-ref-ok' | while IFS= read -r line; do
      echo "  $f:$line" >&2
    done
  done <<< "$new_violations"
  cat >&2 <<'MSG'

tmp/ は .gitignore 対象です。恒久ドキュメントから参照すると別環境でリンク切れになります。

対処:
  1. 参照先の内容が「決定事項」なら → docs/adr/ の ADR に転記（adr-writing skill を利用）
  2. 「エージェントが再利用する手順・落とし穴」なら → 参照ではなく要点を本文に直接書く
  3. tmp/ の運用ルール自体を説明している箇所なら → 該当行に `tmp-ref-ok` コメントを添える
MSG
  exit 1
fi

if [[ -n "$fixed" ]]; then
  echo "✅ ベースラインから解消されたファイルがあります。--baseline で更新してください:"
  echo "$fixed" | sed 's/^/  - /'
fi

echo "✅ tmp/ への新規参照はありません（既知の未解消: ${remaining_count}/${baseline_count} ファイル）"
