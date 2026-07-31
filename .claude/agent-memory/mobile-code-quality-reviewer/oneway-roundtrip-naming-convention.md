---
name: oneway-roundtrip-naming-convention
description: sanposcape mobile の探索/散歩機能では片道値と往復値を別のフィールド名・関数名で厳密に区別する設計になっている（SS-16で確認）。今後この境界を跨ぐ実装をレビューする際のチェックポイント
metadata:
  type: project
---

`packages/mobile/src/features/walk/` では、`/explore/places`（backend）が返す `PlaceCandidate.round_trip_duration_seconds`
/ `round_trip_distance_meters` は片道値を2倍した**往復値**、`/explore/routes/walking` が返す
`duration_seconds` / `distance_meters` は**片道値**という非対称な契約になっている
（`packages/backend/src/sanposcape/maps/service.py:57-58` と `:107-108`）。

mobile 側はこれを型・関数名で明示的に区別している:
- `SpotCandidate.roundTripMinutes` / `roundTripKm`（往復、`/explore/places` 由来）
- `WalkRoute.durationSeconds` / `distanceMeters`（片道、`/explore/routes/walking` 由来）
- `toOneWayMinutes()` / `toKilometers()`（片道のまま変換）と `estimateRoundTripMinutes()`
  （片道×2の**近似**であることをJSDocとUI文言「往復の目安」の両方で明記）は
  `src/features/walk/lib/walkRoute.ts` に分離されている。

**Why:** 周回ルート（往路と復路が別経路）は SS-33 に切り出し済みで、SS-16 時点では
「同じ道を戻る」前提の片道×2で往復を近似している。この前提が崩れる（実際の周回ルートに
置き換わる）と `estimateRoundTripMinutes` の実装・呼び出し箇所すべてが見直し対象になる。

**How to apply:** 今後この機能領域（探索・散歩ルート・SS-33以降の周回ルート等）のレビューでは、
(1) 表示文言に「片道」「往復」「目安」のどれが使われているか、(2) その値がどちらの API由来か、
(3) 往復値を独自に2倍/半分にする処理が新設されていないか、を機械的に横断チェックする。
特に「往復の目安」という文言は複数箇所（`SpotCard` の一覧表示は `/explore/places` 由来、
`WalkRouteSummary`/`WalkActiveView` はルートAPI由来を2倍）で**出典が異なる**ため、
数字がわずかに食い違って見えても即座にバグと判断せず、まずどちらの出典か確認すること。
