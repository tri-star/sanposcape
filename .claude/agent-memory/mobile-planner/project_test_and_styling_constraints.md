---
name: mobile-test-and-styling-constraints
description: vitest が node 環境 + RN スタブのため RN の render テストが書けない件
metadata:
  type: project
---

`packages/mobile` の構造的制約。プランに「コンポーネントをレンダリングしてテスト」と書く前に必ず思い出すこと。

## RN component の render テストは現状書けない

`vitest.config.ts` が `environment: "node"` / `include: ["src/**/*.test.ts"]`(`.tsx` 非対象)で、
`resolve.alias` が `react-native` を `src/test/mocks/react-native.ts`(`Platform` のみ)に丸ごと差し替えている。

**How to apply:** テスト方針は「判定ロジックを純粋関数に切り出して `.test.ts` でテスト」とする。
純粋関数側は `react-native` / `react-native-reanimated` を**値として import しない**(型は `import type` なら可)。
実例: `src/lib/hitSlop.ts` / `src/lib/toPercent.ts` / `src/theme/tokens.ts` の `resolveTheme`。
これは `docs/architecture-guideline.md` の「UIとロジックの分離」方針と一致する。
リポジトリ側の記述は `docs/pages-components-guideline.md` の「テストの書き方」を参照。
