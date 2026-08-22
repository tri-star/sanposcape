---
name: reference-planning-inputs
description: Where SS-xx issue context, milestones, and mobile ADRs live, and where mobile plan files are written
metadata:
  type: reference
  scope: durable
---

Planning inputs for this repo:

- Plane issue IDs are **`SS-xx`** (not `MOB-xx` as the generic agent prompt example suggests). Backend and mobile tasks share the same `SS` sequence (e.g. SS-14 backend routes API, SS-15 mobile explore, SS-16 mobile walk start).
- Remaining work is tracked **in Plane only** (project identifier `SS`), grouped into modules `A: MVP達成に必要な残課題` / `B: MVP後の機能充実・改善` / `C: 開発体験の改善`. `docs/milestones.md` was deleted on 2026-08-22 — do not look for it. The old M1〜M5 modules are archived in Plane and hold the closed issues as history. For a task's surrounding context, read the Plane work item plus the relevant ADR, not a milestone file.
- Mobile ADRs: `packages/mobile/adr/` (ADR-001..007). Cross-cutting ADRs: `docs/adr/`.
- Mobile design docs: `packages/mobile/docs/` (architecture-guideline / folder-structure / naming-conventions / pages-components-guideline / toolsets-libraries).
- Plan output path: `tmp/<issue-id>/mobile-plan.md` at the repo root (e.g. `tmp/SS-16/mobile-plan.md`). <!-- tmp-ref-ok: 参照先ではなくプランの出力先の指示（.claude/agents/ と同じ性質） -->

Related: [[project-explore-api-contract]], [[project-e2e-ci-constraints]]
