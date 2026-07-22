---
name: docs-map-mismatch
description: mobile docs/local-env.md has no troubleshoot table; the actual symptom/cause/fix troubleshoot table lives in docs/app-startup-guide.md
metadata:
  type: project
---

`packages/mobile/docs/local-env.md` covers setup steps but has **no** troubleshoot
(トラブルシュート) section/table. The actual symptom/cause/fix table (`困ったとき（トラブルシュート）`)
lives in `packages/mobile/docs/app-startup-guide.md`, which itself references `local-env.md` for
background/design details.

**Why:** A task description asked to add a troubleshoot entry to `local-env.md`, but the closest
matching content (a markdown table of 症状/原因/対処) only exists in `app-startup-guide.md`. Added
the entry there instead, since it's the actual home of that content shape.

**How to apply:** If asked to add a "troubleshoot" entry to mobile docs, check
`app-startup-guide.md` first — that's where the real table is, not `local-env.md`. Verify this is
still true before relying on it (docs may have been reorganized since this was written).
