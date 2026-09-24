---
name: oxfmt-check-scope-mismatch
description: oxfmt --check . (bare, whole-repo) reports pre-existing failures on docs/*.md, adr/*.md, AGENTS.md etc. that are NOT part of the project's actual format:check scope — don't trust it
metadata:
  type: feedback
  scope: durable
---

Running `pnpm exec oxfmt --check .` (or any invocation with `.` / the whole
`packages/mobile` tree as target) from `packages/mobile` reports ~27 "format issues"
in files like `AGENTS.md`, `adr/ADR-004-*.md`, `adr/ADR-005-*.md`, `docs/*.md`,
`package.json`, `tsconfig.json`, `docs/mock/**`. This happens **even on a pristine
`git stash`ed tree** with zero uncommitted changes — it is pre-existing baseline
noise, not something introduced by the current diff.

**Why:** `package.json`'s actual `format:check` script is scoped to
`oxfmt --check src app index.ts app.config.ts babel.config.js metro.config.js
orval.config.ts vitest.config.ts` — notably **excluding** `docs/`, `adr/`, root
`AGENTS.md`, `package.json`, `tsconfig.json`, and `docs/mock/**` (a checked-in
external mock export). Those files/dirs were apparently never run through oxfmt's
markdown/json formatter and drifted from what bare `oxfmt` would produce. Editing
one of the `.md` files under `docs/`/`adr/` for an unrelated task (e.g. doc-fix
commits) does not make you responsible for reformatting the whole file.

**How to apply:** Always run the project's own script — `pnpm run format:check`
(or `pnpm --filter mobile format:check` from repo root) — rather than `pnpm exec
oxfmt --check .` or `--check <dir>`. If you need to verify only your changed docs
files are fine, pass those exact file paths to `oxfmt --check` (matches
[[oxfmt-individual-file-drift]] guidance to still confirm with the full script
before considering the task done — but the full script here means the
package.json-scoped one, not a bare `.`).
