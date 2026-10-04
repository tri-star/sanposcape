---
name: pattern-usequeries-combine
description: TanStack Query の useQueries の戻り配列は毎レンダー新しい参照になる。派生値を useMemo([queries]) で作らず、combine に安定した関数参照を渡す
metadata:
  type: feedback
  scope: durable
---

SS-118 のレビューで見つけた実装バグの一般形（個別の決定は `packages/mobile/adr/ADR-M-012-pin-map-display-and-detail.md` D15）。

- `useQueries`（TanStack Query v5）の戻り値配列は、データが不変でも**毎レンダー新しい参照**になる
  （query-core の `queriesObserver` が `matches.map(...)` で都度配列を作る。`combine` 未指定なら構造共有は効かない）。
- そのため `useMemo(() => derive(queries), [queries])` は実質毎レンダー再計算になり、結果を `React.memo` の子へ
  渡すと memo が無効化される（SS-118 では毎秒再レンダーされる散歩中画面でマーカーが再描画されていた）。
- 解消形: `useQueries({ queries, combine })` の `combine` に**モジュールレベルの純粋関数**を渡す
  （インラインクロージャは毎回別参照なので不可）。関数参照が不変なら再計算が省かれ、`replaceEqualDeep` で結果の参照が保たれる。
  再試行なども `combine` の戻り値から呼ぶ（実例: `features/pin/lib/pinRead.ts` の `combineRegisteredPinListQueries`）。
- `useQuery` / `useInfiniteQuery` 単体の `.data` は構造共有で安定するので、`[query.data]` 依存の `useMemo` は問題ない。
  この落とし穴は配列を返す `useQueries` に固有。

**Why:** 機能的なバグにならず「意図した最適化が黙って効かない」形で残るため、レビューでしか見つからない。

**How to apply:** `useQueries` を使う hook を見たら、派生値の依存が `queries` 配列そのものになっていないか、
`combine` に安定した関数参照を渡しているかを必ず確認する。
