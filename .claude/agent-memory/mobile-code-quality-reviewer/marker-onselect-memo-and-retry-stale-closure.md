---
name: marker-onselect-memo-and-retry-stale-closure
description: React.memo コンポーネントは、全呼び出し元で props（特にコールバック）が安定しているか横並びで確認する。配列を useCallback に閉じ込める stale closure も疑う（SS-118 の RegisteredPinMarkers/useRegisteredPins で発見、ADR-M-012 D15）
metadata:
  type: feedback
  scope: durable
  adr: packages/mobile/adr/ADR-M-012-pin-map-display-and-detail.md
---

SS-118 のレビューで見つけた2パターン。どちらも同じ PR 内で対応済み。

**パターン1（メモ化の非対称）:** `RegisteredPinMarkers.tsx` は `React.memo` で包まれている。
ところが、呼び出し元の一方は `onSelectPin` を `useCallback` で安定化し、もう一方は毎レンダー新しい
関数を渡していたため、地図のパン・ズームのたびに memo が無効化されていた。現在の呼び出し元は
`PinTabView.tsx` と `app/(tabs)/index.tsx`（`RegisteredPinsMapLayer` 経由）で、どちらも `useCallback` 化済み。

**パターン2（stale closure）:** `useRegisteredPins.ts` の `retry` が、`useQueries` の戻り値の配列を
`useCallback` に閉じ込めて反復しており、依存配列からも外していた。そのため初回レンダー時点の配列が
固定されていた。修正では `useQueries` の `combine` にモジュールレベルの純粋関数
（`pinRead.ts` の `combineRegisteredPinListQueries`）を渡し、戻り値の `refetchAll` を `retry` から呼ぶ形にした。
決定は `packages/mobile/adr/ADR-M-012-pin-map-display-and-detail.md` の D15 にある。

**How to apply:**
- `React.memo` コンポーネントが複数箇所から使われていたら、全呼び出し元で props が `useCallback`/`useMemo`
  により安定しているか横並びで比べる。
- `exhaustive-deps` を disable して配列を依存から外している `useCallback` は、配列の長さが後から
  変わりうるか確認する。変わりうるなら、`combine` の戻り値経由か ref 経由で最新値を読むよう指摘する
  （意図的な最適化との区別は [[intentional-render-phase-patterns]] を参照）。
