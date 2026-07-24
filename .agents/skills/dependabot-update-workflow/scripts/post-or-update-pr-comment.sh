#!/bin/bash
set -euo pipefail

# Usage: ./post-or-update-pr-comment.sh <pr-number> <marker> <body-file>
# Run from within the git repository. Requires gh CLI authenticated.
#
# Upserts a PR comment: if an existing comment containing <marker> is found,
# it is updated in place; otherwise a new comment is created. The marker is
# embedded as an HTML comment at the top of the body so it is invisible when
# rendered on GitHub.
#
#   <pr-number>  : target PR number
#   <marker>     : unique HTML comment marker, e.g. "<!-- dependabot-update-explanation -->"
#   <body-file>  : path to a file containing the comment body (Markdown allowed)
#
# Outputs JSON describing the resulting comment (id, url, and whether it was
# created or updated).

PR_NUMBER=${1:?"Usage: $0 <pr-number> <marker> <body-file>"}
MARKER=${2:?"Usage: $0 <pr-number> <marker> <body-file>"}
BODY_FILE=${3:?"Usage: $0 <pr-number> <marker> <body-file>"}

if [[ ! -f "$BODY_FILE" ]]; then
  echo "error: body file not found: ${BODY_FILE}" >&2
  exit 1
fi

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# Build the full comment body with the marker embedded at the top.
FULL_BODY_FILE=$(mktemp)
trap 'rm -f "$FULL_BODY_FILE"' EXIT
{
  echo "$MARKER"
  echo
  cat "$BODY_FILE"
} >"$FULL_BODY_FILE"

# Look for an existing issue comment containing the marker.
EXISTING_ID=$(gh api "repos/${REPO}/issues/${PR_NUMBER}/comments" --paginate \
  --jq "[.[] | select(.body | type == \"string\" and startswith(\"${MARKER}\"))][0].id // empty")

if [[ -n "$EXISTING_ID" ]]; then
  RESULT=$(gh api "repos/${REPO}/issues/comments/${EXISTING_ID}" \
    -X PATCH \
    -F body=@"$FULL_BODY_FILE")
  jq -n --argjson comment "$RESULT" '{action: "updated", id: $comment.id, url: $comment.html_url}'
else
  RESULT=$(gh api "repos/${REPO}/issues/${PR_NUMBER}/comments" \
    -X POST \
    -F body=@"$FULL_BODY_FILE")
  jq -n --argjson comment "$RESULT" '{action: "created", id: $comment.id, url: $comment.html_url}'
fi
