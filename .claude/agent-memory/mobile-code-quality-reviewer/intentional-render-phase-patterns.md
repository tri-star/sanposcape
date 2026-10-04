---
name: intentional-render-phase-patterns
description: render 中の ref 代入（最新値を読むため）と、render 中の条件付き setState（派生 state）は、このコードベースで意図的に使われている正当なパターン。誤って指摘しないための判定基準
metadata:
  type: feedback
  scope: durable
---

## render 中に ref.current へ最新値を代入する

`features/walk/hooks/useWalkTracking.ts` の `pausedRef`（render 本体で `pausedRef.current = paused;`）
が最初の例。`src/hooks/useScreenBack.ts` の `interceptRef`/`fallbackRef` も、同じ手法であることを
コメントで明示している。effect/callback の依存配列に値を入れたくない（入れると購読の貼り直しや
関数の identity 変化が起きる）が、常に最新値を読みたい、という場面で使う。

**How to apply:** アンチパターンとして指摘しない。ただし、どの依存配列から外したいのか、
つまりこの手法を使う理由がコード上に説明されているかは確認する。

## render 中に条件付きで setState する（派生 state の調整）

`useEffect` の中で派生 state を set すると、oxlint の `react(set-state-in-effect)` 警告が出るうえ、
描画が1フレーム遅れる。そのため、React 公式が認める「レンダー中に state を調整する」形
（hook 本体に `if (x === null) { setX(...); }`）を使う。実例は `usePinLocationPicker.ts`（SS-124）と
`useRegisteredPins.ts`（`settledTruncated` の取り込み）。

**How to apply:** 「レンダー中に setState している」ことだけを理由に Must/Should で指摘しない。
次の2点を手で追ってから判断する。
1. set した後に条件が偽になり、無限ループにならないか。
2. 同種のブロックが複数ある場合、互いに二重発火しないか。
