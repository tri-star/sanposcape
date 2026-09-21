---
name: react-compiler-manual-memo-warning
description: app.jsonのexperiments.reactCompiler有効時にoxlintが出すreact(preserve-manual-memoization)警告の直し方
metadata:
  type: feedback
  scope: durable
---

## `react(preserve-manual-memoization)` 警告が出たら手動メモ化を削る

`app.json`の`experiments.reactCompiler: true`が有効なこのプロジェクトでは、`useMemo`/`useCallback`
の依存配列が React Compiler の静的解析と食い違うと oxlint が
`react(preserve-manual-memoization): Existing memoization could not be preserved` という warning
（exit code は 0 のまま = ビルドは壊れない）を出す。典型例:

- 依存配列に含めた値（例: 別の`useMemo`の結果）が毎レンダー新しい参照になる場合。
- state setter（`setXxx`）を依存に含めている場合、compiler の推論結果と食い違うことがある
  （`useMemo has a missing dependency: 'draft'`のような`exhaustive-deps`警告も併発しやすい）。

**直し方（SS-88で確立）**: 対象の計算が軽量（文字数チェック・小さい配列の走査・単純な条件分岐）
なら、**`useMemo`/`useCallback`ごと外して素の計算・素の関数定義にする**。React Compiler が
ビルド時に自動メモ化するため、手動メモ化は必須ではなく、むしろ依存配列のズレで警告と
バグ（想定より多い/少ない再計算）の両方の火種になる。

外してよいかの判断基準:
- 子コンポーネントが`React.memo`でない（参照安定性がレンダー抑制に効かない）。
- 計算コストが「文字数チェック」「10件未満の配列走査」程度。

外すと危険なケース（残すべき）: `useQuery`/`useMutation`の`queryKey`/オプションオブジェクト、
`useEffect`の依存に渡すオブジェクト、実際に高コストな計算。

参照実装: `packages/mobile/src/features/pin/hooks/usePinRegister.ts`
（`fieldErrors`/`saveAvailability`/`addTagFromInput`/`removeTag`/`submit`から手動メモ化を除去）。
