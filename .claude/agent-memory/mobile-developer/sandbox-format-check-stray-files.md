---
name: sandbox-format-check-stray-files
description: pnpm --filter mobile format:check can fail in this sandbox due to untracked stray files (.mcp.json, .claude/ under src/) unrelated to actual changes
metadata:
  type: feedback
---

`pnpm --filter mobile format:check` (oxfmt) can fail with "Failed to read file" errors on stray
untracked files like `.mcp.json` or `.claude/settings*.json` that end up nested under `src/`
(e.g. `src/components/ui/.mcp.json`) in this sandbox environment — these are not part of the
actual task and should not be touched.

**Why:** The sandbox occasionally leaks config/session files into the working tree at whatever
the cwd happened to be when some tool ran. `oxfmt --check src app scripts ...` walks those
directories and chokes on the stray files, even though they're irrelevant to the diff being
worked on.

**How to apply:** When the full `format:check` script fails this way, run `oxfmt --check` (or
plain `oxfmt` to fix) on just the specific files you changed instead of the whole `src`/`docs`
tree, e.g. `pnpm exec oxfmt --check <changed files...>` from `packages/mobile`. Do not `git add -A`
or otherwise stage/commit these stray files — stage changed paths explicitly.
