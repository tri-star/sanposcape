#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  open-worktree-vscode.sh <worktree_path>

Opens the given worktree in VS Code (code command), ONLY if <worktree_path> matches:
  /home/*/projects/*.worktrees/*

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

if ! command -v code >/dev/null 2>&1; then
  echo "Error: 'code' command not found. Install VS Code and enable the CLI." >&2
  exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
worktree_path=$(bash "$script_dir/_validate_worktree_path.sh" "$1")

code -- "$worktree_path"

echo "Opened in VS Code: $worktree_path" >&2
