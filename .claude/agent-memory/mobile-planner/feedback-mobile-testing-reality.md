---
name: feedback-mobile-testing-reality
description: mobile テストの実態 — msw は使う(汎用プロンプトと矛盾)、RN component の render テストは書けない(vitest が node 環境 + RN スタブ)。判定ロジックは純粋関数へ切り出す
metadata:
  type: feedback
  scope: durable
---

Two things about mobile tests where the generic planner instructions diverge from this repo — trust the repo.

1. **msw IS used.** The generic mobile-planner prompt says "mobile では msw は使いません", but `packages/mobile/src/test/setup.ts` starts `setupServer()` with `onUnhandledRequest: "error"`, `msw` is a devDependency, and Orval generates `*.msw.ts` handlers (e.g. `getSearchExplorePlacesMockHandler`, `getGetWalkingRouteExploreRoutesWalkingMockHandler`) that existing tests such as `src/features/walk/api/exploreApi.test.ts` use. Plans must follow the repo, not the prompt.
2. **No RN rendering tests.** `vitest.config.ts` is `environment: "node"`, `include: ["src/**/*.test.ts"]` (`.tsx` excluded), and `resolve.alias` replaces `react-native` wholesale with `src/test/mocks/react-native.ts` (which only provides `Platform`); `expo-secure-store` / `expo-location` are stubbed the same way. **プランに「コンポーネントをレンダリングしてテスト」と書く前に必ず思い出すこと。** 純粋関数側は `react-native` / `react-native-reanimated` を**値として import しない**（型は `import type` なら可）。実例: `src/lib/hitSlop.ts` / `src/lib/toPercent.ts` / `src/theme/tokens.ts` の `resolveTheme`。リポジトリ側の記述は `docs/pages-components-guideline.md` の「テストの書き方」節。

**Why:** the repo's own `docs/architecture-guideline.md` and `docs/pages-components-guideline.md` codify both; contradicting them produces plans that cannot be implemented.

**How to apply:** in every plan, push judgement/formatting logic out of hooks and components into `features/<feature>/lib/*.ts` pure functions (no value-import of `react-native`) and put the test coverage there. Never plan a `.test.tsx`. For services, unit tests must import the concrete factory (`createMockLocationService`, `createSessionAuthService`) directly — never the `services/<x>/index.ts` barrel, which can reach native modules through the mode switch.

Related: [[project-e2e-ci-constraints]]
