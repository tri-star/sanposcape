---
name: testing-constraints
description: mobile の Vitest は node環境+.tsのみ対象。hooks/componentsに直接テストが無くても指摘しない
metadata:
  type: project
---

`packages/mobile/vitest.config.ts` は `environment:"node"` / `include:["src/**/*.test.ts"]`。
`resolve.alias` で `react-native` を最小スタブに差し替えているため、**コンポーネントの
レンダリングテストは書けない**（`.tsx` は対象外）。

- `hooks/` と `components/` はこの制約により直接の単体テストを持たない設計が正しい。
  レビューで「hookにテストが無い」「componentにテストが無い」と機械的に指摘しない。
- 正しい実装は、判定・整形ロジックを `lib/` の純粋関数（`react-native` を値 import しない）へ
  切り出し、そこを `.test.ts` でテストする形。`useWalkDelete.ts` にテストが無いのは正しい設計
  （`walkDeleteError.ts` / `walkDetailBodyState.ts` / `walkDeleteCopy.ts` 側でロジックをテスト済み）。
- API 層（`features/*/api/`）は生成 hook ではなく素の fetcher を薄くラップする方針のため
  `react-native` に到達せず、msw（`src/test/setup.ts` の `server`。`onUnhandledRequest:"error"`）で
  テストできる。
- ストア（Zustand）は React 非依存なので `getState()`/`setState()` で直接操作してテストする。

**Why**: `docs/architecture-guideline.md`「テストの方針」/ `docs/pages-components-guideline.md`
「テストの書き方」に明記された既定の制約。知らずにレビューすると「テストカバレッジ不足」という
誤った Warning を量産することになる。

**How to apply**: mobile のテスト網羅性をレビューするときは、まず対象ロジックが `lib/` に
切り出されているか（切り出せるのに hooks/components に残っていないか）を見る。切り出し済みで
`lib/*.test.ts` があれば、hooks/components 自体にテストが無いことは問題にしない。
