---
name: pitfalls
description: TypeScript/React でハマった落とし穴(__DEV__ の globalThis 型、Rules of Hooks違反の見落とし)
metadata:
  type: project
---

## `__DEV__` を `globalThis.__DEV__ = ...` で代入すると TS2339 になる

React Native の型定義(`node_modules/react-native/src/types/globals.d.ts`)は
`declare global { const __DEV__: boolean; ... }` という **`const`** 宣言になっている。
TypeScript の既知の挙動として、`declare global` 内の `const`/`let` はバレ識別子としての参照
(`if (__DEV__) {...}`)はできるが、**`typeof globalThis` の型には反映されない**(`var` なら反映される)。

そのため:

- 生成コード側で `globalThis.__DEV__ = false;` と書くと `Property '__DEV__' does not exist on type
  'typeof globalThis'` で落ちる。
- **対応**: `Object.assign(globalThis, { __DEV__: false });` を使う(型チェックを迂回しつつ実行時には
  正しく `globalThis.__DEV__` に代入される)。
- テスト側で一時的に上書きしたい場合は `vi.stubGlobal("__DEV__", true)` を使う(こちらは元から
  文字列キー引数なので型エラーにならない)。

## Rules of Hooks: 早期 return を持つコンポーネントで hook の呼び出し順を崩しやすい

「マウント状態を内部 state で遅延させ、閉じるアニメーション完了後にアンマウントする」パターン
(`if (!mounted) return null;` を JSX の直前に置く)を書くとき、`useAnimatedStyle` などの hook を
うっかりその return の**後**に書いてしまうミスをした(oxlint はこれを検出しなかった)。
**全ての hook 呼び出しは早期 return より前に配置する**こと。実装後は目視で hook の呼び出し順を確認する。

## 派生指標（ペース等）は表示用に丸めた値ではなく生値から計算する

`formatPace(durationSeconds, distanceMeters)`（`features/history/lib/walkMetrics.ts`）が
`toKilometers(distanceMeters)`（表示用に小数1桁へ丸めた km）を使ってペースを計算していたため、
2143m/1920秒のような例で約2%のズレ（14'56"/km のはずが15'14"/km になる）が出ていた（SS-20レビュー指摘）。
**表示用の丸めとロジック内部の計算を同じ関数に混ぜない**: 丸めは表示直前の1箇所（呼び出し側が
`toKilometers` を呼ぶ／`.toFixed(1)` する）に留め、内部計算は `toNonNegative(meters) / 1000` のような
生値を使う。同種の「複数の表示値から別の指標を導出する」処理を書くときは、どこか1つの丸め済み値を
再利用していないか確認する。

## バリデーションを既存関数に追加すると、プレースホルダーIDを使う既存テストが通信前に落ちる

`fetchWalkDetail(walkId)` に `isUuid()` 検証を追加したところ、既存テストが `walkId` として
`"walk-1"` のような非UUID文字列を渡していたため、msw のモックハンドラに届く前に 404 で失敗するように
なった（SS-20レビュー対応）。**関数に入力検証を後付けするときは、その関数を呼んでいる既存テストの
フィクスチャ値（特に `"xxx-1"` のような仮の識別子）が新しい検証条件を満たすか必ず確認する**。
満たさない場合はテスト側のフィクスチャを検証条件に合う値（例: 実際のUUID形式）に更新する。

## `oxfmt` はコマンド実行のたびにファイルを自動整形する

`pnpm format` / `pnpm lint`(実体は oxfmt/oxlint)を実行すると、直前に Write/Edit したファイルが
その場でフォーマットし直される。ツール呼び出し直後に diff の再確認を求められることがあるが、
内容的な変更ではなく整形のみなので、意図した変更が保たれているかだけ確認すれば十分。
