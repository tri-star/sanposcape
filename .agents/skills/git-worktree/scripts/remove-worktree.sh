#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  remove-worktree.sh <worktree_path>

Safely removes a git worktree ONLY if <worktree_path> matches:
  /home/*/projects/*.worktrees/*

It resolves the canonical path via realpath, validates it, then runs:
  git -C <main_repo_root> worktree remove --force <worktree_path>

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

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
worktree_path=$(bash "$script_dir/_validate_worktree_path.sh" "$1")

# Read .git file to locate the main repo.
# In a worktree, .git is typically a file containing: "gitdir: <path>"
if [[ -f "$worktree_path/.git" ]]; then
  gitdir_raw=$(sed -n 's/^gitdir: //p' "$worktree_path/.git" | head -n 1 || true)
else
  gitdir_raw=""
fi

if [[ "$gitdir_raw" == "" ]]; then
  echo "Error: could not determine gitdir from $worktree_path/.git" >&2
  exit 1
fi

if [[ "$gitdir_raw" = /* ]]; then
  gitdir=$(realpath -m -- "$gitdir_raw")
else
  gitdir=$(realpath -m -- "$worktree_path/$gitdir_raw")
fi

if [[ ! -d "$gitdir" ]]; then
  echo "Error: gitdir is not a directory: $gitdir" >&2
  exit 1
fi

main_git_dir=$(dirname -- "$(dirname -- "$gitdir")")
main_repo_root=$(dirname -- "$main_git_dir")

if [[ ! -d "$main_repo_root" ]]; then
  echo "Error: main repo root not found: $main_repo_root" >&2
  exit 1
fi

# Confirm it's a git repo.
if ! git -C "$main_repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: not a git repo: $main_repo_root" >&2
  exit 1
fi

# Remove via git.
git -C "$main_repo_root" worktree remove --force -- "$worktree_path"

# If anything remains, remove it defensively.
if [[ -e "$worktree_path" ]]; then
  rm -rf --one-file-system -- "$worktree_path"
fi

echo "Removed: $worktree_path" >&2
