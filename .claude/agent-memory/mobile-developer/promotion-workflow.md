---
name: promotion-workflow
description: Safe procedure for promoting code from features/<x>/lib|components to src/lib or src/components/ui when a second feature needs it
metadata:
  type: feedback
---

This project's `folder-structure.md` rule: code starts in `features/<feature>/`, and gets
promoted to `src/lib/` (pure functions) or `src/components/ui/<kebab-case>/` (RN components)
only once a **second** feature actually needs it. Confirmed working procedure (used in SS-20
promoting `numberGuard`/`geoCoordinate`/`units`/`mapRegion`/`WalkRoutePolyline` from
`features/walk` so `features/history` could use them too):

1. Write the new file at the destination path with the same implementation (add a JSDoc note
   explaining why it was promoted and where it came from).
2. Update every importer to the new path (grep for the old import path across `src/` and `app/`
   first — do this in one Edit call per file, not piecemeal).
3. Run `pnpm typecheck` and `pnpm test` — they must be green before deleting anything. The
   pre-existing tests at the destination act as the regression check.
4. Only then delete the old file(s) (implementation + its `.test.ts`).
5. Commit the promotion as its own commit, separate from the feature commit that motivated it
   (e.g. "refactor(mobile): xxxをsrc/libへ昇格する"). This was explicitly requested by the user
   for SS-20 and made the diff much easier to review.

**Why:** keeps the promotion diff mechanical/reviewable and lets the existing test suite catch
any accidental behavior change during the move, per [[test-scope-hooks-components]].

**How to apply:** any time a `features/<feature>/lib/*.ts` or `features/<feature>/components/*.tsx`
file needs to be referenced from a second feature, follow this exact sequence rather than doing
an import-and-delete in one step.
