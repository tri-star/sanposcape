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

## `oxfmt` はコマンド実行のたびにファイルを自動整形する

`pnpm format` / `pnpm lint`(実体は oxfmt/oxlint)を実行すると、直前に Write/Edit したファイルが
その場でフォーマットし直される。ツール呼び出し直後に diff の再確認を求められることがあるが、
内容的な変更ではなく整形のみなので、意図した変更が保たれているかだけ確認すれば十分。
