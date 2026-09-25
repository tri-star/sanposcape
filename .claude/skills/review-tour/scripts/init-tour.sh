#!/bin/bash
set -euo pipefail

# Usage:
#   ./init-tour.sh <pr-number> [--refresh]
#   ./init-tour.sh --local [base] [--refresh]
#
# tmp/review-tour/<ツアーID>/ に作業フォルダを用意し、比較する commit を tour.json に固定する。
# 既にある場合は上書きせず、進捗を出力して再開できるようにする(冪等)。
# --refresh を付けると、比較する commit だけを最新に取り直す(観点と進捗は残す)。
#
# PR モードでは refs/pull/<N>/head を fetch するだけで、checkout はしない。
# レビュー中にユーザーの作業ツリーを変えないため。
#
# 出力(JSON):
#   {"tour_id": "123", "dir": "...", "existing": true, "head_moved": false,
#    "source": {...}, "viewpoints": {"selected": 2, "done": 1}, "findings": 3}

MODE=pr
NUMBER=""
BASE=""
REFRESH=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local)
      MODE=local
      shift
      if [[ $# -gt 0 && "$1" != --* ]]; then
        BASE=$1
        shift
      fi
      ;;
    --refresh) REFRESH=true; shift ;;
    *)
      if [[ -n "$NUMBER" ]]; then
        echo "error: 不明な引数: $1" >&2
        exit 2
      fi
      NUMBER=$1
      shift
      ;;
  esac
done

if [[ "$MODE" == "pr" && ! "$NUMBER" =~ ^[0-9]+$ ]]; then
  echo "Usage: $0 <pr-number> [--refresh] | --local [base] [--refresh]" >&2
  exit 2
fi

cd "$(git rev-parse --show-toplevel)"

# 現時点の比較対象(head/base の commit)を解決する。
if [[ "$MODE" == "pr" ]]; then
  TOUR_ID=$NUMBER
  PR_JSON=$(gh pr view "$NUMBER" --json baseRefName,headRefOid)
  BASE=$(jq -r '.baseRefName' <<< "$PR_JSON")
  REMOTE_HEAD=$(jq -r '.headRefOid' <<< "$PR_JSON")
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
else
  BASE=${BASE:-main}
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  TOUR_ID=$(tr -c 'A-Za-z0-9_-' '-' <<< "$BRANCH" | sed 's/-*$//')
  REMOTE_HEAD=$(git rev-parse HEAD)
  REPO=""
fi

DIR="tmp/review-tour/${TOUR_ID}"
TOUR_JSON="$DIR/tour.json"
EXISTING=false
[[ -f "$TOUR_JSON" ]] && EXISTING=true
mkdir -p "$DIR"

PINNED_HEAD=""
if [[ "$EXISTING" == true ]]; then
  PINNED_HEAD=$(jq -r '.source.head_sha // empty' "$TOUR_JSON")
fi

HEAD_MOVED=false
if [[ -n "$PINNED_HEAD" && "$PINNED_HEAD" != "$REMOTE_HEAD" ]]; then
  HEAD_MOVED=true
fi

if [[ -z "$PINNED_HEAD" || "$REFRESH" == true ]]; then
  if [[ "$MODE" == "pr" ]]; then
    # 複数の ref を1回で fetch すると FETCH_HEAD が先頭の ref を指すため、PR head は単独で取る。
    git fetch --quiet origin "$BASE" 2>/dev/null || {
      echo "error: origin/${BASE} を fetch できません。" >&2
      exit 1
    }
    git fetch --quiet origin "refs/pull/${NUMBER}/head" 2>/dev/null || {
      echo "error: PR #${NUMBER} の head を fetch できません。" >&2
      exit 1
    }
    HEAD_SHA=$(git rev-parse FETCH_HEAD)
    BASE_SHA=$(git merge-base "refs/remotes/origin/${BASE}" "$HEAD_SHA")
  else
    HEAD_SHA=$REMOTE_HEAD
    BASE_SHA=$(git merge-base "$BASE" "$HEAD_SHA")
  fi

  SOURCE=$(jq -n \
    --arg mode "$MODE" \
    --arg number "$NUMBER" \
    --arg base "$BASE" \
    --arg repo "$REPO" \
    --arg base_sha "$BASE_SHA" \
    --arg head_sha "$HEAD_SHA" \
    '{mode: $mode,
      number: (if $number == "" then null else ($number | tonumber) end),
      base: $base,
      repo: (if $repo == "" then null else $repo end),
      base_sha: $base_sha,
      head_sha: $head_sha}')
  NOW=$(date +%Y-%m-%dT%H:%M:%S%z)

  if [[ "$EXISTING" == true ]]; then
    TMP=$(mktemp)
    jq --argjson source "$SOURCE" --arg now "$NOW" '.source = $source | .updated_at = $now' "$TOUR_JSON" > "$TMP"
    mv "$TMP" "$TOUR_JSON"
  else
    jq -n --arg id "$TOUR_ID" --arg now "$NOW" --argjson source "$SOURCE" '{
      tour_id: $id,
      created_at: $now,
      updated_at: $now,
      source: $source,
      viewpoints: []
    }' > "$TOUR_JSON"
  fi
  HEAD_MOVED=false
fi

if [[ ! -f "$DIR/review.md" ]]; then
  cat > "$DIR/review.md" <<'TEMPLATE'
# レビュー指摘事項

`add-finding.sh` が追記する。手で編集する場合も ID の連番を崩さないこと。

- severity: `high`(マージ前に対応) / `medium`(対応を推奨) / `low`(任意) / `info`(質問・確認)
- state: `open` / `resolved` / `wontfix`

TEMPLATE
fi

FINDINGS=$(grep -c '^### F-' "$DIR/review.md" 2>/dev/null || true)

jq -n \
  --arg tour_id "$TOUR_ID" \
  --arg dir "$DIR" \
  --argjson existing "$EXISTING" \
  --argjson head_moved "$HEAD_MOVED" \
  --argjson findings "${FINDINGS:-0}" \
  --slurpfile tour "$TOUR_JSON" \
  '{
     tour_id: $tour_id,
     dir: $dir,
     existing: $existing,
     head_moved: $head_moved,
     source: $tour[0].source,
     viewpoints: {
       selected: ([$tour[0].viewpoints[] | select(.state != "candidate")] | length),
       done: ([$tour[0].viewpoints[] | select(.state == "done" or .state == "skipped")] | length)
     },
     findings: $findings
   }'
