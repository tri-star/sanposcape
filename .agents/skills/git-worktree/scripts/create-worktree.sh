#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  create-worktree.sh --branch <name> [--base <ref>]

Creates a git worktree under:
  <repo_root>.worktrees/<name>

Then prints the created worktree path on stdout.

Notes:
- <name> must match: ^[A-Za-z0-9._-]+$
- The resulting path must match: /home/*/projects/*.worktrees/*
USAGE
}

branch=""
base_ref="HEAD"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      branch="${2:-}"
      shift 2
      ;;
    --base)
      base_ref="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ "$branch" == "" ]]; then
  echo "Error: --branch is required" >&2
  usage
  exit 2
fi

# Disallow slashes to keep the worktree as a single directory under *.worktrees/*
if [[ ! "$branch" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Error: invalid branch/worktree name: $branch" >&2
  echo "Allowed: letters, numbers, dot, underscore, hyphen" >&2
  exit 1
fi

repo_root=$(git rev-parse --show-toplevel 2>/dev/null)
if [[ "$repo_root" == "" ]]; then
  echo "Error: not inside a git repository" >&2
  exit 1
fi

worktrees_root="${repo_root}.worktrees"
mkdir -p -- "$worktrees_root"

worktree_path="$worktrees_root/$branch"

# Canonicalize (does not require existence).
canonical=$(realpath -m -- "$worktree_path")
allowed_re='^/home/[^/]+/projects/[^/]+\.worktrees/[^/]+$'
if [[ ! "$canonical" =~ $allowed_re ]]; then
  echo "Error: computed worktree path is not allowed:" >&2
  echo "  got: $canonical" >&2
  echo "  expected: /home/*/projects/*.worktrees/*" >&2
  exit 1
fi

if [[ -e "$canonical" ]]; then
  echo "Error: worktree path already exists: $canonical" >&2
  exit 1
fi

# If branch exists locally, add it. Otherwise create from base_ref.
if git show-ref --verify --quiet "refs/heads/$branch"; then
  git worktree add -- "$canonical" "$branch"
else
  git worktree add -b "$branch" -- "$canonical" "$base_ref"
fi

echo "$canonical"
