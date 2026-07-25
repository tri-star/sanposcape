---
name: expo-router-app-structure
description: Expo Router (SDK 57 / expo-router 57) の型生成手順、index.tsx と (tabs)/index.tsx の共存、Tabs の非推奨警告
metadata:
  type: project
---

## `.expo/types/router.d.ts` はCI/ローカルどちらも明示生成が必要

- `experiments.typedRoutes: true` のこのプロジェクトでは、`router.push("/xxx")` 等の文字列が
  `.expo/types/router.d.ts`（gitignore対象）を見て型検査される。
- `expo start` を一度実行すると自動生成されるが、CI やスクリプトから `tsc --noEmit` だけ叩く場合は
  事前に `pnpm --filter mobile exec expo customize tsconfig.json` を実行して型を生成しておく必要がある
  （`.github/workflows/mobile-ci.yml` に "Generate Expo Router typed routes" ステップとして追加済み）。
- サンドボックス環境で `expo` CLI を叩くときは `HOME="$TMPDIR/fakehome" EXPO_NO_TELEMETRY=1` を付ける
  （[[sandbox-expo-home-workaround]] 参照）。
- **注意**: `.expo/` はモノレポの作業ディレクトリに紐づき、ブランチを切り替えても自動では消えない。
  別ブランチで生成された古い `router.d.ts`（存在しないルートを指す型）が残っていると、
  `useLocalSearchParams` 等の型が実際のファイル構成とズレる。ルート追加/削除後は必ず
  `expo customize tsconfig.json` を再実行して型を最新化すること。

## `app/index.tsx` と `app/(tabs)/index.tsx` は共存できる

- 「ルートの `index.tsx`（スプラッシュ等）」と「タブグループの `index.tsx`（既定タブ）」は
  どちらも “collapsed" pathname としては `/` を主張するように見えるが、これは
  [Expo Router公式の認証フローガイド](https://docs.expo.dev/router/reference/authentication/) にも
  登場する正式なパターンで、衝突しない。
  - `expo customize tsconfig.json` で生成される `router.d.ts` を見ると、
    ルート直下の `index.tsx` は `{ pathname: '/' }`、タブグループの `index.tsx` は
    `{ pathname: '/(tabs)' | '/' }` という**別々の href エントリ**として両方登録される。
  - 実際のナビゲーションでは、タブ側へは常にグループ修飾形（`/(tabs)`）で明示的に遷移する
    （`router.replace({ pathname: "/(tabs)", params: {...} })` 等）。裸の `"/"` は使わない。

## `Tabs`（`import { Tabs } from "expo-router"`）は非推奨だが動作する

- expo-router 57 では `Tabs` に `@deprecated Use 'expo-router/js-tabs' instead` の JSDoc が付いている。
  ただし実装は残っており、`tabBar={(props) => <CustomTabBar {...props} />}` によるカスタムタブバー
  差し替え（`BottomTabBarProps` = `{ state, descriptors, navigation, insets }`）は問題なく機能する
  （typecheck / 実装とも成功）。
- `BottomTabBarProps` は `expo-router` のトップレベルからは re-export されていない
  （`export { Tabs } from './layouts/Tabs'` は named re-export のため、そのモジュール内の
  `export * from '../react-navigation/bottom-tabs'` は伝播しない）。
  内部パス `expo-router/build/react-navigation/bottom-tabs` を直接 import するのは壊れやすいので、
  **カスタムタブバー側で実際に使うフィールドだけを持つ最小限のローカル型**
  （`{ state: { index, routes }, navigation: { navigate }, insets: { bottom } }`）を自前定義し、
  構造的部分型で受け取るのが安全（`AppTabBar.tsx` 参照）。
