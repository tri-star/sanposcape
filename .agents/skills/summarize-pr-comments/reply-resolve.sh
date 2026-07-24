#!/bin/bash
set -euo pipefail

# Usage: ./reply-resolve.sh <thread-id> <reply-body> [--resolve]
# Run from within the git repository. Requires gh CLI authenticated.
#
# Replies to a single PR review thread, and optionally resolves (closes) it.
#
#   <thread-id>   : reviewThreads.nodes.id from get-pr-comments.sh
#   <reply-body>  : reply text (Markdown allowed)
#   --resolve     : resolve (close) the thread after replying
#
# Outputs JSON describing the reply (URL) and, when --resolve is given,
# the resulting isResolved state of the thread.

THREAD_ID=${1:?"Usage: $0 <thread-id> <reply-body> [--resolve]"}
BODY=${2:?"Usage: $0 <thread-id> <reply-body> [--resolve]"}
RESOLVE=false

if [[ "${3:-}" == "--resolve" ]]; then
  RESOLVE=true
elif [[ -n "${3:-}" ]]; then
  echo "Unknown argument: ${3}" >&2
  echo "Usage: $0 <thread-id> <reply-body> [--resolve]" >&2
  exit 1
fi

REPLY_MUTATION='
mutation AddReply($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $threadId, body: $body}) {
    comment {
      id
      url
      body
      createdAt
      author {
        login
      }
    }
  }
}
'

reply_result=$(gh api graphql \
  -f query="$REPLY_MUTATION" \
  -F threadId="$THREAD_ID" \
  -F body="$BODY")

if [[ "$RESOLVE" != "true" ]]; then
  echo "$reply_result"
  exit 0
fi

RESOLVE_MUTATION='
mutation ResolveThread($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) {
    thread {
      id
      isResolved
    }
  }
}
'

resolve_result=$(gh api graphql \
  -f query="$RESOLVE_MUTATION" \
  -F threadId="$THREAD_ID")

# Combine reply + resolve results into a single JSON object.
jq -n --argjson reply "$reply_result" --argjson resolve "$resolve_result" \
  '{reply: $reply, resolve: $resolve}'
