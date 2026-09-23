---
name: vitest-no-rn-render-tests
description: このリポジトリのvitestはnode環境+react-native最小スタブのため、コンポーネント/hookのレンダリングテストが書けない（レビュー時の減点対象にしない）
metadata:
  type: project
---

`vitest.config.ts` は `environment: "node"` かつ `resolve.alias` で `react-native` を
`src/test/mocks/react-native.ts`（最小スタブ）に差し替えている。`include` も `src/**/*.test.ts`
のみで `.tsx` は対象外。

そのため、**コンポーネント（.tsx）や `react-native` を値importするhook（BackHandler等）は
Vitestでテストできない**。プロジェクトはこれを前提に、判定・変換ロジックを
`react-native`/`expo-router` を一切import しない純粋関数へ切り出し、`lib/` に置いて
`.test.ts` で担保する方針を徹底している（例: `src/lib/backNavigation.ts` の
`resolveBackAction`、`src/lib/hitSlop.ts`、`src/theme/tokens.ts` の `resolveTheme`、
SS-13 の `src/features/auth/lib/authGate.ts`）。

レビュー時の判断基準:
- 新しい hook / コンポーネントが `react-native` を値importしているのに `.test.ts` が無くても、
  それ自体は減点対象ではない（むしろ書けないので書かないのが正しい）。判定ロジックが
  `lib/` や `store/` にちゃんと分離されテストされているかを見る。
- 画面の見た目確認は `/dev-screens`（`ScreenCatalog`）での目視に委ねる方針
  （[[back-navigation-convention]] の実装もこの前提の上に成り立っている）。
