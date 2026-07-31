---
name: feedback-mobile-testing-reality
description: This project DOES use msw for unit tests (contradicting the generic planner prompt) and cannot render RN components in Vitest
metadata:
  type: feedback
---

Two things about mobile tests where the generic planner instructions diverge from this repo — trust the repo.

1. **msw IS used.** The generic mobile-planner prompt says "mobile では msw は使いません", but `packages/mobile/src/test/setup.ts` starts `setupServer()` with `onUnhandledRequest: "error"`, `msw` is a devDependency, and Orval generates `*.msw.ts` handlers (e.g. `getSearchExplorePlacesMockHandler`, `getGetWalkingRouteExploreRoutesWalkingMockHandler`) that existing tests such as `src/features/walk/api/exploreApi.test.ts` use. Plans must follow the repo, not the prompt.
2. **No RN rendering tests.** `vitest.config.ts` is `environment: "node"`, `include: ["src/**/*.test.ts"]` (`.tsx` excluded), and aliases `react-native` / `expo-secure-store` / `expo-location` to stubs in `src/test/mocks/`.

**Why:** the repo's own `docs/architecture-guideline.md` and `docs/pages-components-guideline.md` codify both; contradicting them produces plans that cannot be implemented.

**How to apply:** in every plan, push judgement/formatting logic out of hooks and components into `features/<feature>/lib/*.ts` pure functions (no value-import of `react-native`) and put the test coverage there. Never plan a `.test.tsx`. For services, unit tests must import the concrete factory (`createMockLocationService`, `createSessionAuthService`) directly — never the `services/<x>/index.ts` barrel, which can reach native modules through the mode switch.

Related: [[project-e2e-ci-constraints]]
