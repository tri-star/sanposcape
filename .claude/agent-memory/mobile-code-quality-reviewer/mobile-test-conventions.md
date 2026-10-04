---
name: mobile-test-conventions
description: mobile の Vitest は node 環境で .ts だけが対象。hooks/components にテストが無いことは指摘しない。テーブル駆動テストは src/lib/backNavigation.test.ts の it.each 形式が基準
metadata:
  type: reference
  scope: durable
---

## テスト対象の制約（知らないと誤った Warning を量産する）

`packages/mobile/vitest.config.ts` は `environment: "node"`、`include: ["src/**/*.test.ts"]` で、
`resolve.alias` により `react-native` と各 expo モジュールを最小スタブに差し替えている。
そのため**コンポーネントのレンダリングテストは書けない**（`.tsx` は対象外）。
`docs/architecture-guideline.md`「テストの方針」と `docs/pages-components-guideline.md`
「テストの書き方」に明記された既定の制約。

- 判定・整形ロジックは `lib/` の純粋関数（`react-native` を値 import しない）へ切り出し、
  `.test.ts` でテストするのが正しい形。例: `useWalkDelete.ts` 自体にはテストが無いが、
  ロジックは `walkDeleteError.ts`/`walkDetailBodyState.ts`/`walkDeleteCopy.ts` 側でテスト済み。
  ほかに `src/lib/backNavigation.ts`、`src/lib/hitSlop.ts`、`src/theme/tokens.ts`、
  `src/features/auth/lib/authGate.ts` も同じ形になっている。
- API 層（`features/*/api/`）は msw（`src/test/setup.ts` の `server`、`onUnhandledRequest: "error"`）で、
  Zustand ストアは `getState()`/`setState()` で直接テストできる。
- 画面の見た目は `/dev-screens`（`ScreenCatalog`）での目視に委ねる方針。

**How to apply:** テスト網羅性を見るときは、まずロジックが `lib/` に切り出されているかを確認する。
切り出し済みで `lib/*.test.ts` があれば、hooks/components 自体にテストが無いことは問題にしない。

## テーブル駆動テストの基準

`src/lib/backNavigation.test.ts` の
`it.each([...] as const)("... → $expected", ...)`（単一テーブル＋テンプレート文字列のタイトル）が、
プランで繰り返し名指しされる事実上の模範。SS-37 では、プランがこれを参考にするよう指示していたのに、
実装は個別の `it()` を並べていた。

**How to apply:** プランや既存テストが「参考にせよ」と名指しする形式に、実装が倣っているか確認する。
倣っていなくても Low の Suggestion に留める。
