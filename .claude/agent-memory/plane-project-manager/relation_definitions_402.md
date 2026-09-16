---
name: relation-definitions-402
description: Custom "relates to" relation now works via mcp__plane__workitem_relation (list_definitions/create) as of 2026-09-17; the old 402 block on the legacy list_work_item_relation_definitions tool no longer applies
metadata:
  type: feedback
  scope: durable
---

**Update 2026-09-17**: The current `mcp__plane__workitem_relation` tool's `list_definitions` action succeeds (no 402) and returns a default custom definition **"Relates to"** (id `d496b11b-a5c7-4804-a70d-130c8d4e9488`, outward/inward label both `"relates to"`) plus `"Duplicate"` (id `25a9827d-ca06-4727-9f2e-79d7b87d4c63`). Successfully created a `relates to` link between SS-92 and SS-33 using `workitem_relation create` with `relation_definition_id=d496b11b-a5c7-4804-a70d-130c8d4e9488`, `relation_definition_label="relates to"`.

**How to apply now:** When a user asks to "関連付けて / relates to" two work items in this project, use `workitem_relation create` with `workitem_id`, `workitem_ids=[<other id>]`, `relation_definition_id="d496b11b-a5c7-4804-a70d-130c8d4e9488"`, `relation_definition_label="relates to"`. No need to fall back to comment/link-only anymore — try this first. If it ever fails again, re-run `workitem_relation list_definitions` to confirm the id is still valid before falling back to a description mention or `workitem_link`.

---

### Historical note (superseded, kept for context)

Previously (confirmed 2026-08-01, tried twice through the older `list_work_item_relation_definitions` tool) custom relation definitions returned `HTTP 402: Payment Required`, and only built-in dependency `relation_type` values (`blocking`, `blocked_by`, `start_before`, `start_after`, `finish_before`, `finish_after`) worked. This was cited when linking SS-33↔SS-16, SS-36↔SS-19, SS-61↔SS-37 etc. via description text or parent/child instead. **This limitation no longer reproduces** as of 2026-09-17 — either the plan changed or the tool changed. Don't assume 402 anymore; try `workitem_relation list_definitions`/`create` first.
