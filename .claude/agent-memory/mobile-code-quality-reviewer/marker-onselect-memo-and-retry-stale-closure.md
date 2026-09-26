---
name: marker-onselect-memo-and-retry-stale-closure
description: SS-118のRegisteredPinMarkers/useRegisteredPinsで見つけた「React.memo無効化」と「useCallback stale closure」の2パターン
metadata:
  type: project
  adr: packages/mobile/adr/ADR-012-pin-map-display-and-detail.md
  scope: durable
  source_issue: SS-118
---

`RegisteredPinMarkers`（`packages/mobile/src/features/pin/components/RegisteredPinMarkers.tsx`）は
`React.memo` で包まれ、JSDoc に「`pins` の参照が変わらない限り再レンダーしない
（`WalkActiveView` は経過時間で毎秒再レンダーされるため）」と明記されている。この意図が
呼び出し元ごとに守られているかは要チェック。

**見つけたパターン1（メモ化の非対称）**: `app/(tabs)/index.tsx`（`WalkActiveRoute`）は
`handleSelectPin` を `useCallback` で安定化しているが、`PinMapView.tsx` 側は
`handleSelectPin` が素の関数（毎レンダー新規生成）だった。`visibleRegion` の更新
（パン・ズームのたび）で `PinMapView` が再レンダーされるたびに `onSelectPin` の参照が変わり、
`RegisteredPinMarkers` の `React.memo` が実質無効化される。`tracksViewChanges={false}` により
ネイティブ再描画コストは抑えられるが、意図したメモ化が片方の呼び出し元だけ機能しない状態は
見落とされやすい。

**見つけたパターン2（useCallbackのstale closure）**: `useRegisteredPins.ts` の `retry`:
```ts
const retry = useCallback(() => {
  retryMaps();
  for (const query of queries) { void query.refetch(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- queries は最新のクロージャ内の値を使うだけでよい
}, [retryMaps]);
```
`useQueries` の戻り値 `queries` は毎レンダー新しい配列になるため依存に含めていないが、
`useCallback` の依存が `[retryMaps]` だけだと**初回レンダー時点の `queries` 配列**を
クロージャに固定してしまう（stale closure）。「毎レンダー新しい配列だから依存に入れない」は
「最新の値を参照し続けたい」という目的とは矛盾する判断で、exhaustive-deps の disable コメントの
理由付けが妥当かどうかは実際に「後から要素数が変わる配列か」を確認すべき。

**解消方法（同PR内で対応済み）**: パターン1は `PinMapView` の `handleSelectPin` を `useCallback` 化。
パターン2は `useQueries` の `combine` にモジュールレベルの純粋関数を渡し、その戻り値の `refetchAll` を
`retry` から呼ぶ形にして、生の結果配列をクロージャに閉じ込めないようにした（mobile ADR-012 D15）。

**Why**: `React.memo` の効果検証は「メモ化されたコンポーネントの props が全呼び出し元で
安定しているか」を横並びで見ないと片方だけ見落とす。`useCallback`/`useMemo` の
`eslint-disable-next-line exhaustive-deps` コメントは、意図的な最適化（[[render-phase-setstate-derived-state-pattern]]
のような）と、単なる stale closure バグを見分ける必要がある。

**How to apply**: `React.memo` コンポーネントを複数箇所から使っている実装を見たら、各呼び出し元で
props（特にコールバック）が `useCallback` 化されているか横並びで比較する。`useQueries`/配列を
返す hook の戻り値をクロージャで捕まえて後から反復する実装（`for (const x of arr)` を
`useCallback` 内に置くパターン）は、配列の長さが変わりうるか（地図の増減・リストアイテムの
増減）を確認し、変わりうるなら `combine` の戻り値経由（`useQueries` の場合）か ref 経由での最新値参照に直すべきと指摘する。
