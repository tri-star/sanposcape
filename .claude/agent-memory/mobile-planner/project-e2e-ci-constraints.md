---
name: project-e2e-ci-constraints
description: CI runs the whole .maestro/ directory and the preview APK has no Maps/Google keys — do not plan E2E flows that need map or explore results
metadata:
  type: project
---

Two constraints that together kill most "add a Maestro flow" plan items:

1. `.github/workflows/mobile-e2e.yml` runs `maestro test packages/mobile/.maestro/` — **the entire directory**. There is no flow allowlist, so a "local-only" flow file added to `.maestro/` will run in CI and fail it.
2. Per ADR-004, the CI preview APK gets no Maps SDK key (map renders grey) and the CI backend has no Google server key, so `/explore/places` returns 503 → **no spot candidates → any flow depending on selecting a spot cannot proceed**. Dev-only routes (`/dev-screens`, `/design-system`) are `__DEV__`-guarded and redirect to `/` in the release preview build.

3. **`(tabs)` 配下の画面は E2E から到達できない**。サインイン（`useAuthActions`）→ `router.replace("/walk-start")`、`(tabs)` に入る唯一の導線は `WalkStartView` の「散歩を始める」→ `router.replace("/(tabs)")`。スポット選択が 503 で不可能な CI では、ナビ/検索/記録タブとその先（履歴など）に一切辿り着けない。

**Why:** cost/secret-management decision recorded in `packages/mobile/adr/ADR-004-e2e-build-ci-strategy.md`.

**How to apply:** when a task's feature depends on map data or explore results, plan **no `.maestro/` changes** and instead write an explicit manual verification checklist into the plan (development build + `EXPO_PUBLIC_LOCATION_MODE`, `adb emu geo fix`, backend with a real Google key). Also: never rename existing `testID`s that current flows assert (`walk-start-screen`, `walk-start-duration-slider`, `walk-start-begin`, `splash-screen`, `sign-in-google-button`).

Related: [[project-explore-api-contract]], [[feedback-mobile-testing-reality]]
