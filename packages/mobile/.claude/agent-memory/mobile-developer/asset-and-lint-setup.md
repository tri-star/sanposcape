---
name: asset-and-lint-setup
description: PNG import の型宣言、oxlintrc に docs/mock を含める必要、@react-native-community/slider 追加時の注意
metadata:
  type: project
---

## `import x from "@/assets/images/foo.png"` には型宣言が必要

このプロジェクトの `tsconfig.json`（`expo/tsconfig.base` 継承・`moduleResolution: bundler`）には
`*.png` 等の画像モジュール用アンビエント宣言が最初から入っていない
（`expo`/`react-native` パッケージのどちらも `declare module '*.png'` を提供していない）。
`require("...png")` は `require` 自体が型付けされておらず使えないため、
`src/types/images.d.ts` に以下を用意して `import` 文で読み込む方針にした。

```ts
declare module "*.png" {
  import type { ImageSourcePropType } from "react-native";
  const value: ImageSourcePropType;
  export default value;
}
```

`@/assets/*` エイリアス（`tsconfig.json` に元から定義済み）と組み合わせて
`import walkerImage from "@/assets/images/walker.png";` の形で使う。

## `.oxlintrc.json` の `ignorePatterns` に `docs/mock/**` が無いと lint が壊れる

`docs/mock/` にはデザインモック用の生成物（`support.js` や `_ds_bundle.js` など、アプリコード規約に
従っていないベンダー的な JS）が入っており、`ignorePatterns` に含めないと `pnpm lint` が
アプリコードと無関係な `eqeqeq` 等のエラーで失敗する。`src/api/generated/**` 等と同様に
`docs/mock/**` も除外パターンに入れておくこと（SS-8 で追加）。

## `@react-native-community/slider` 追加時のメモ

- 往復時間スライダー用に `pnpm add @react-native-community/slider` で追加（Expo 57 系で動作確認、
  peerDependencies 制約なし）。
- 薄いラッパー `src/components/ui/slider/Slider.tsx` を作り、`minimumTrackTintColor` /
  `maximumTrackTintColor` / `thumbTintColor` をトークン（`theme.colors.primary` /
  `theme.colors.trackStrong`）で着色する。ネイティブ Slider は `min`/`max`/`value` から
  自動でトラックの塗り分けを行うため、`toPercent` 的な百分率計算をこちら側で持つ必要はない。
