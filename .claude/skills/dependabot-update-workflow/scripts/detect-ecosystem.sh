#!/bin/bash
set -euo pipefail

# Usage: ./detect-ecosystem.sh <pr-number>
# Run from within the git repository. Requires gh CLI authenticated.
#
# Inspects a Dependabot PR's head branch name and changed files to determine
# which part of the repository it targets, and outputs a JSON object:
#   {"ecosystem": "frontend|backend|github-actions", "package_manager": "...", "directory": "..."}

PR_NUMBER=${1:?"Usage: $0 <pr-number>"}

PR_JSON=$(gh pr view "$PR_NUMBER" --json headRefName,files)

HEAD_REF=$(echo "$PR_JSON" | jq -r '.headRefName')
FILES=$(echo "$PR_JSON" | jq -r '.files[].path')

if [[ -z "$HEAD_REF" || "$HEAD_REF" == "null" ]]; then
  echo "error: could not resolve headRefName for PR #${PR_NUMBER}" >&2
  exit 1
fi

ECOSYSTEM=""
PACKAGE_MANAGER=""
DIRECTORY=""

# Dependabot branch names follow: dependabot/<package-manager>/<...>
if [[ "$HEAD_REF" == dependabot/uv/* ]]; then
  ECOSYSTEM="backend"
  PACKAGE_MANAGER="uv"
  DIRECTORY="packages/backend"
elif [[ "$HEAD_REF" == dependabot/npm_and_yarn/* || "$HEAD_REF" == dependabot/npm/* ]]; then
  ECOSYSTEM="frontend"
  PACKAGE_MANAGER="npm"
  DIRECTORY="/"
elif [[ "$HEAD_REF" == dependabot/github_actions/* ]]; then
  ECOSYSTEM="github-actions"
  PACKAGE_MANAGER="github-actions"
  DIRECTORY=".github/workflows"
fi

# Fall back to inspecting changed files when the branch name alone was not enough
# (e.g. renamed/custom branch names, or ambiguous cases).
if [[ -z "$ECOSYSTEM" ]]; then
  if echo "$FILES" | grep -q '^\.github/workflows/'; then
    ECOSYSTEM="github-actions"
    PACKAGE_MANAGER="github-actions"
    DIRECTORY=".github/workflows"
  elif echo "$FILES" | grep -q '^packages/backend/'; then
    ECOSYSTEM="backend"
    PACKAGE_MANAGER="uv"
    DIRECTORY="packages/backend"
  elif echo "$FILES" | grep -qE '^(package\.json|pnpm-lock\.yaml|packages/frontend/)'; then
    ECOSYSTEM="frontend"
    PACKAGE_MANAGER="npm"
    DIRECTORY="/"
  fi
fi

if [[ -z "$ECOSYSTEM" ]]; then
  echo "error: could not determine ecosystem for PR #${PR_NUMBER} (headRefName=${HEAD_REF})" >&2
  echo "changed files:" >&2
  echo "$FILES" >&2
  exit 1
fi

jq -n \
  --arg ecosystem "$ECOSYSTEM" \
  --arg package_manager "$PACKAGE_MANAGER" \
  --arg directory "$DIRECTORY" \
  --arg head_ref "$HEAD_REF" \
  '{ecosystem: $ecosystem, package_manager: $package_manager, directory: $directory, head_ref: $head_ref}'
