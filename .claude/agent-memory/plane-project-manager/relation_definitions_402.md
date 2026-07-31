---
name: relation-definitions-402
description: list_work_item_relation_definitions and non-built-in relation types (e.g. relates_to) fail with HTTP 402 on this workspace's Plane plan
metadata:
  type: project
---

`mcp__plane__list_work_item_relation_definitions` returns `HTTP 402: Payment Required` on this workspace (confirmed 2026-08-01, tried twice). This means custom relation definitions (which is where "relates_to" style labels live) are a paid-plan feature not available here.

`create_work_item_relation` only accepts these built-in `relation_type` values without a custom definition:
`blocking`, `blocked_by`, `start_before`, `start_after`, `finish_before`, `finish_after`.

**Why:** Attempted to link SS-33 to SS-16 with `relation_type="relates_to"` — rejected because relates_to isn't a built-in dependency type; falling back to `list_work_item_relation_definitions` to find/create a custom "relates to" definition then failed with 402 Payment Required (workspace plan limitation, not a transient error).

**How to apply:** Don't retry `list_work_item_relation_definitions` or custom relation creation on this workspace — it will keep failing until the Plane plan changes. If a user asks for a "relates_to" / non-dependency relation, explain this limitation upfront and offer alternatives: a built-in dependency relation if it actually fits (rare), a comment/description mention, or a work item link (`create_work_item_link`) pointing to the other item's URL.
