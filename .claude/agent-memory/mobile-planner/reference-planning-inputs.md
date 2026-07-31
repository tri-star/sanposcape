---
name: reference-planning-inputs
description: Where SS-xx issue context, milestones, and mobile ADRs live, and where mobile plan files are written
metadata:
  type: reference
---

Planning inputs for this repo:

- Plane issue IDs are **`SS-xx`** (not `MOB-xx` as the generic agent prompt example suggests). Backend and mobile tasks share the same `SS` sequence (e.g. SS-14 backend routes API, SS-15 mobile explore, SS-16 mobile walk start).
- Milestone definitions and per-milestone completion checkboxes: `docs/milestones.md` (repo root). It records which SS issue satisfied each checkbox — read it to scope a task precisely.
- Mobile ADRs: `packages/mobile/adr/` (ADR-001..007). Cross-cutting ADRs: `docs/adr/`.
- Mobile design docs: `packages/mobile/docs/` (architecture-guideline / folder-structure / naming-conventions / pages-components-guideline / toolsets-libraries).
- Plan output path: `tmp/<issue-id>/mobile-plan.md` at the repo root (e.g. `tmp/SS-16/mobile-plan.md`).

Related: [[project-explore-api-contract]], [[project-e2e-ci-constraints]]
