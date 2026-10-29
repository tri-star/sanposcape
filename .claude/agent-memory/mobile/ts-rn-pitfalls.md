---
name: ts-rn-pitfalls
description: mobile の TS・RN・UI 実装の落とし穴 — __DEV__ の代入、丸め値からの派生、軌跡の spread、検証の後付けで落ちるフィクスチャ、FlatList の flex:1、入れ子の Pressable、renderBody、ReactNode の ??、Text プリミティブ無し、lucide の版差
metadata:
  type: feedback
  scope: durable
  verify_by: 2027-03-31
---

スタイル・UI プリミティブ・a11y の規約は `pages-components-guideline.md` が正本。ここには実装で踏んだ落とし穴を置く。

## TypeScript

- **`globalThis.__DEV__ = false` は TS2339 になる**（RN の型は `declare global { const __DEV__ }` で、`const` は `typeof globalThis` に載らない）。
  `Object.assign(globalThis, { __DEV__: false })` を使う。テストで上書きするなら `vi.stubGlobal("__DEV__", true)`。
- **`ReactNode` の optional prop の既定値に `??` を使わない。** 明示の `null`（何も描かない）まで既定値に倒す。`x === undefined ? fallback : x` と書く（`FeatureGate.tsx` の `pending`）。

## 計算

- **表示用に丸めた値から派生値を計算しない。** `formatPace` が小数1桁に丸めた km でペースを出し、約2%ずれた（SS-20。SS-65 で平均時速の `toAverageSpeedKmh` に置き換え、生値で計算する方針と回帰テストを引き継いだ）。丸めは表示直前の1箇所にし、内部計算は生値で行う。
- **軌跡（最大10,000点。ADR-003）に `Math.max(...array)` を使わない。** 引数の上限でスタックが溢れうる。`for` ループで min/max を取る（`src/lib/mapRegion.ts` が先例）。
- **既存関数に入力検証を後付けすると、仮の ID（`"walk-1"` 等）を使う既存テストが通信前に落ちる。** フィクスチャを検証条件に合う値（実際の UUID 形式）に直す。

## レイアウトと部品

- **flex column の画面で、ヘッダーの後の `FlatList` / `ScrollView` には自身の `style` に `flex: 1` が要る**（`contentContainerStyle` とは別）。無いと潰れて空に見える（SS-20）。
- **行全体を Pressable にして中に Checkbox / Switch を置くとき**は、行に `onPress`・`accessibilityRole="checkbox"`・`accessibilityState` を持たせ、
  中は `<View pointerEvents="none">` で表示専用にする。`pointerEvents` は a11y ツリーから消さないので、`accessibilityElementsHidden` と
  `importantForAccessibility="no-hide-descendants"` も付ける（`CategorySheet.tsx`。レビュー側は `.claude/skills/change-review/references/mobile.md`）。
- **状態ごとに中央寄せが変わる画面**は、`renderBody()` が `{ content, centered }` を返す形にして判定を1箇所に閉じる
  （`features/history/components/WalkHistoryListView.tsx`。同じ条件を2箇所に書いていたのを SS-20 で直した）。
- **`Text` のプリミティブは無い。** RN の `Text` を直接 import してテーマのトークンでスタイルする（手本は `DesignSystemGallery.tsx`）。

## アイコン（lucide-react-native の版差）

lucide は版でアイコン名が変わり、無い名前を import するとバンドルが失敗する。typecheck と Vitest では検出できない（SS-190。1.50.0 で `building-2` / `trash-2` などがリネーム）。

**How to apply:** アイコンを足すときは `pnpm-lock.yaml` の版を確かめ、その版の `lucide-react-native/icons/<name>` があるかを見る
（main の node_modules は lockfile より古いことがある。[[sandbox-and-tooling]]）。登録は `src/components/ui/icon/iconRegistry.ts`。

Related: [[hooks-and-query]], [[maps]]
