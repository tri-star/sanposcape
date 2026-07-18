#!/bin/bash
set -euo pipefail

# Usage: ./get-pr-comments.sh <pr-number>
# Run from within the git repository. Requires gh CLI authenticated.
#
# Outputs JSON with two sections:
#   - reviewThreads: inline code review comments (with thread/minimize info)
#   - comments: general PR discussion comments (with minimize info)

PR_NUMBER=${1:?"Usage: $0 <pr-number>"}

QUERY='
query GetPRComments($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      number
      title
      url
      reviewThreads(first: 100) {
        totalCount
        nodes {
          id
          isResolved
          isOutdated
          isCollapsed
          path
          line
          originalLine
          startLine
          diffSide
          comments(first: 100) {
            totalCount
            nodes {
              id
              databaseId
              body
              path
              line
              originalLine
              diffHunk
              isMinimized
              minimizedReason
              createdAt
              updatedAt
              author {
                login
              }
            }
          }
        }
      }
      comments(first: 100) {
        totalCount
        nodes {
          id
          databaseId
          body
          isMinimized
          minimizedReason
          createdAt
          updatedAt
          author {
            login
          }
        }
      }
    }
  }
}
'

gh api graphql \
  -F owner="{owner}" \
  -F repo="{repo}" \
  -F number="$PR_NUMBER" \
  -f query="$QUERY"
