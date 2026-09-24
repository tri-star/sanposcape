---
name: render-phase-setstate-derived-state-pattern
description: useEffectでの派生setStateがoxlintのreact(set-state-in-effect)に引っかかる場合の回避パターン。誤指摘しないための判定基準
metadata:
  type: project
  scope: task-local
  source_issue: SS-124
---

SS-124 の `usePinLocationPicker.ts`（`packages/mobile/src/features/pin/hooks/usePinLocationPicker.ts`）は、
「他の値から純粋に導出できる setState を `useEffect` に入れている」ことで oxlint の
`react(set-state-in-effect)` 警告（React Compiler 由来）が出たため、React 公式が認める
「レンダー中に state を直接調整する」パターン（`if (x === null) { setX(...); }` を関数本体に書く。
条件で保護されているため無限ループにならない）に書き換えている。

**Why**: `useEffect` にすると1フレーム遅れて描画される上、oxlint 警告が出る。React の公式ドキュメントが
明示的に認めている書き方なので、単に「useEffect を使っていない」だけでは反アンチパターンと
誤指摘しない。

**How to apply**: レビューで `useState` の直後に `if (cond) { setX(...); }` のような分岐が
コンポーネント/hook 本体（useEffect の外）にあるのを見たら、まずこのパターンだと疑う。判定基準:
(1) 条件が set 後に偽になり無限ループにならないか、(2) 複数の同種ブロックがある場合は
互いに競合（二重発火）しないか、を手で追って確認してから可否を判断する。単純に
「レンダー中に setState している」ことだけを理由に Must/Should の指摘をしない。
関連: [[table-driven-test-style-reference]] 各種 mobile 規約と同様、handover-notes/tmp に
「なぜこの形にしたか」が書かれていることが多いので先に読む。
