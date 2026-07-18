#!/usr/bin/env bash
set -euo pipefail

# --- Find project root (directory containing .git) ---
find_project_root() {
  local dir="$PWD"
  while [[ "$dir" != "/" ]]; do
    if [[ -e "$dir/.git" ]]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

project_root="$(find_project_root)" || {
  echo "Error: Could not find project root (.git not found in any ancestor directory)." >&2
  exit 1
}

# --- Resolve source directory (../assets/initial-contents relative to this script) ---
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source_dir="${script_dir}/../assets/initial-contents"

if [[ ! -d "$source_dir" ]]; then
  echo "Error: Source directory not found: ${source_dir}" >&2
  exit 1
fi

# --- Copy files to project root ---
cp -r "$source_dir"/. "$project_root"/

echo "Copied initial contents to ${project_root}"
