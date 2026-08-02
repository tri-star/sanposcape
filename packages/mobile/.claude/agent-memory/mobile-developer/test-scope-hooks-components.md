---
name: test-scope-hooks-components
description: This project's vitest setup cannot render RN components or run hooks — only lib/ (pure functions) and api/ (fetch wrappers) get .test.ts files
metadata:
  type: project
---

`vitest.config.ts` runs with `environment: "node"` and `include: ["src/**/*.test.ts"]` (no
`.tsx`), with `react-native` aliased to a minimal stub
(`src/test/mocks/react-native.ts`). This means:

- `features/<x>/hooks/*.ts` (useState/useEffect/TanStack Query hooks) — **no tests**. Confirmed
  again in SS-20: `useWalkHistory.ts` / `useWalkDetail.ts` were left untested per
  `docs/architecture-guideline.md` and the plan's own §6.3 ("テストを書かないもの").
- `features/<x>/components/*.tsx` — **no tests**, same reason.
- `features/<x>/lib/*.ts` (pure functions, no `react-native` value import) — always gets a
  co-located `.test.ts`. This is where all business logic (formatting, error classification,
  pagination/dedup, request param building) should live specifically so it's testable.
- `features/<x>/api/*.ts` (thin wrapper around Orval's generated fetcher, not the generated
  `useXxx` hook) — gets a `.test.ts` using `msw` (`src/test/setup.ts`'s `server`) and the
  Orval-generated `*.msw.ts` mock handlers.

**Why:** the RN render-test gap is a known, permanent constraint of this codebase (see
`docs/pages-components-guideline.md` "RNの render テストは書けない"), not something to work
around per-task. `[[promotion-workflow]]` and any new feature should push all testable
decisions down into `lib/`.

**How to apply:** when planning tests for a new feature, only write `.test.ts` for `lib/` and
`api/`. Do not spend time trying to find a way to test `hooks/` or `components/` — visual
verification is done via `/dev-screens` (`ScreenCatalog`) instead.
