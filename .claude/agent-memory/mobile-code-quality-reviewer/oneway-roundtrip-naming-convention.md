---
name: oneway-roundtrip-naming-convention
description: sanposcape mobile の探索/散歩機能で「片道 vs 往復（周回）」をどう区別しているか。SS-16時点の契約はSS-33で覆っているので必ず最新のtypes.ts/walkRoute.tsを確認すること
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-008-active-walk-state-and-route-cache.md
---

**SS-33（2026-08-23マージ）で契約が変わった。以下は現行（SS-33以降）の状態。**

- `SpotCandidate.roundTripMinutes` / `roundTripKm`（`/explore/places` 由来のスナップショット・概算。
  backend が `片道 × 2 × LOOP_FACTOR` で補正した値を返す。mobile 側では再補正しない）。
- `WalkRoute.durationSeconds` / `distanceMeters`（**周回ルート全体**の実値。SS-33 以降は片道ではない。
  `/explore/routes/walking` が `route_type: "loop"` のとき往路+復路の連結値を返す）。
- `WalkRoute.legs: WalkRouteLeg[]`（往路/復路それぞれの区間値。`kind: "outbound" | "return"`）。
  セレクタは `src/features/walk/lib/walkRouteLeg.ts` の `findWalkRouteLeg` / `hasDistinctLegs` を必ず通す
  （`legs` の件数を直接見ない）。
- 分換算は `toRouteMinutes()`（`src/features/walk/lib/walkRoute.ts`）に一本化された。
  **`estimateRoundTripMinutes()` / `toOneWayMinutes()` は SS-33 で削除済み**（もし見かけたら復活したリグレッションを疑う）。
- 「同じ道を戻る」フォールバック（backend が周回を作れなかった場合）は `returnIsSamePath: true` で表現し、
  `hasDistinctLegs()` が false になる。この場合 UI は「同じ道を戻ります」に degrade する
  （`WalkRouteSummary.tsx`）。kill switch（backend `GOOGLE_MAPS_LOOP_ROUTE_ENABLED`）OFF 時は常にこの状態。
- SS-35 の復路再計算（`route_type: "one_way"`、現在地→出発地）は周回ではなく片道。
  この場合のみ `legs: []` で `WalkRoute.durationSeconds` は片道の実値になる（例外パターン）。

**Why:** SS-16 時点は「往路と復路が同じ道」前提で `WalkRoute` の値は片道、往復は
`estimateRoundTripMinutes()`（片道×2の近似）で表示していた。SS-33 で「往路と復路が異なる周回ルート」が
MVP必須になり、backend が周回全体の実値を返すようになったため、上記の意味論が全面的に変わった。
このメモリを更新せずに「`WalkRoute.durationSeconds` は片道」という古い前提でレビューすると、
SS-33 以降のコードに対して的外れな指摘をすることになる（実際に一度、誤った前提のままレビュー依頼が来た）。

**How to apply:** この機能領域をレビューする際は、まず `src/features/walk/types.ts` の `WalkRoute` の
JSDoc（「SS-33 以降、durationSeconds/distanceMeters/path/bounds は周回ルート全体」）と
`src/features/walk/lib/walkRouteLeg.ts` の実装を直接読んで現状の契約を確認すること。
「往復の目安」（一覧・`SpotCard`・`spot.roundTripMinutes` 由来）と「往復」（選択後・`WalkRouteSummary`/
`WalkActiveView`・`walkRoute.durationSeconds` 由来）は語彙で意図的に区別されており、
数字がズレて見えても出典が異なるだけで即座にバグと判断しない（LOOP_FACTOR 補正で構造的なズレは
縮んでいるが解消はしていない）。
