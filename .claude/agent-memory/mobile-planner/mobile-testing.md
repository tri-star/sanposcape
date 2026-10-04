---
name: mobile-testing
description: mobile テストの実態 — msw は使う(汎用プロンプトと矛盾)、RN の render テストは書けない(vitest は node 環境 + RN スタブ)。判定・文言は純粋関数へ切り出し、表示は /dev-screens で目視
metadata:
  type: feedback
  scope: durable
---

汎用の mobile-planner プロンプトとこの repo の実態が食い違う点。**repo に従う**。
リポジトリ側の記述は `packages/mobile/docs/architecture-guideline.md`（テスト方針）と `pages-components-guideline.md`「テストの書き方」節。

1. **msw は使う**。プロンプトの「mobile では msw は使いません」は誤り。`orval.config.ts` が `mock: true` で MSW ハンドラ
   （`get` + PascalCase(operationId) + `MockHandler`）を生成し、`src/test/setup.ts` が `setupServer({ onUnhandledRequest: "error" })` を
   全テスト共通で起動する。`src/api/client.ts` と `features/*/api/*.ts`（素の fetcher）は msw でテストする（例: `walkApi.test.ts`）。
   引数なしの faker モックは enum や map のキーを乱数で作るので、不変条件を持つレスポンスは明示的に渡すようプランに書く。
2. **RN のレンダリングテストは書けない**。`vitest.config.ts` は `environment: "node"`、`include: ["src/**/*.test.ts"]`（`.tsx` は対象外）、
   `resolve.alias` で `react-native` を最小スタブに差し替え（他に `expo-secure-store` / `expo-location` / `expo-crypto` /
   `expo-task-manager` / `expo-file-system` もモック）。→ **`.test.tsx` を計画しない**。hooks / components はテストできない。
3. テストしたい判定・整形・文言は `features/<f>/lib/*.ts` か `src/lib/` の純粋関数へ切り出す（`react-native` を値 import しない。
   型は `import type` 可）。Zustand ストアと素の fetcher もテストできる。テストは co-location。
4. services の単体テストは具体ファクトリ（`createMockLocationService`、`createSessionAuthService` 等）を直接 import する。
   `services/<x>/index.ts` のバレルはモード切替経由でネイティブに届きうるので使わない。
5. 表示の担保は「純粋関数での文言テスト（自動）」+「`/dev-screens` の `ScreenCatalog` からの目視（手動）」の二段。
   主要画面を足したら `ScreenCatalog` にエントリを1件足す。

**Why:** これに反するプランは実装できない（テストが書けない／既存テスト基盤と衝突する）。

**How to apply:** プランのテスト項目を書く前にこのメモを確認し、ロジックの置き場を純粋関数に寄せる。

Related: [[project-e2e-ci-constraints]], [[mobile-structure]]
