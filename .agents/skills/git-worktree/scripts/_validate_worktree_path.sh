#!/usr/bin/env bash
set -euo pipefail

# Validates that a given path is a safe, existing worktree directory.
# Allowed pattern (glob): /home/*/projects/*.worktrees/*
# Implemented as regex after canonicalization via realpath.

usage() {
  cat <<'USAGE' >&2
Usage:
  _validate_worktree_path.sh <worktree_path>

Outputs:
  Prints the canonical, validated absolute path on stdout.
USAGE
}

if [[ ${1:-} == "-h" || ${1:-} == "--help" ]]; then
  usage
  exit 0
fi

if [[ ${1:-} == "" ]]; then
  usage
  exit 2
fi

candidate="$1"

# Reject obviously suspicious inputs early (newlines, empty).
if [[ "$candidate" == *$'\n'* || "$candidate" == *$'\r'* ]]; then
  echo "Error: invalid path (contains newline)" >&2
  exit 1
fi

# Resolve symlinks and canonicalize. Require it to exist.
if ! canonical=$(realpath -e -- "$candidate" 2>/dev/null); then
  echo "Error: path does not exist: $candidate" >&2
  exit 1
fi

# Regex: ^/home/[^/]+/projects/[^/]+\.worktrees/[^/]+$
allowed_re='^/home/[^/]+/projects/[^/]+\.worktrees/[^/]+$'

if [[ ! "$canonical" =~ $allowed_re ]]; then
  echo "Error: path is not an allowed worktree location:" >&2
  echo "  got: $canonical" >&2
  echo "  expected: /home/*/projects/*.worktrees/*" >&2
  exit 1
fi

if [[ ! -d "$canonical" ]]; then
  echo "Error: not a directory: $canonical" >&2
  exit 1
fi

# Basic sanity: should look like a git worktree.
if [[ ! -e "$canonical/.git" ]]; then
  echo "Error: .git not found in: $canonical" >&2
  exit 1
fi

echo "$canonical"
