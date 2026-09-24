---
name: oneway-roundtrip-naming-convention
description: sanposcape mobile の探索/散歩機能では片道×2近似の値と周回ルート実値を別のフィールド名・関数名で厳密に区別する設計になっている（SS-16で確認、SS-33で周回ルート導入に伴い前提が更新された）。今後この境界を跨ぐ実装をレビューする際のチェックポイント
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-008-active-walk-state-and-route-cache.md
---

**SS-33 で前提が変わった**: 周回ルート（往路と異なる道で復路を歩く。作れなければ「同じ道」で
フォールバック）が `POST /explore/routes/loop` として実装され、mobile の散歩開始・散歩中画面は
この API を使うようになった。旧 `/explore/routes/walking`（片道のみ）は `deprecated: true` が付き、
mobile はもう呼ばない。以下は SS-33 時点で有効な区別。

`packages/mobile/src/features/walk/` では、`/explore/places`（backend）が返す `PlaceCandidate.round_trip_duration_seconds`
/ `round_trip_distance_meters` は片道値を2倍した**近似の往復値**のまま変わっていない。一方、選択後に
取得する `POST /explore/routes/loop` の `duration_seconds` / `distance_meters` は**周回ルート全体
（往路+復路の実測合計）**であり、片道値ではない（`legs: [outbound, return]` を持つ）。

mobile 側はこれを型・関数名で明示的に区別している:
- `SpotCandidate.roundTripMinutes` / `roundTripKm`（候補一覧の近似値、`/explore/places` 由来。SS-33 でも変更なし）
- `ActiveWalk.loopMinutes` / `loopKm`（散歩開始後の周回実値、`/explore/routes/loop` 由来。
  **SS-33 で `roundTripMinutes`/`roundTripKm` から rename**）
- `toRouteMinutes()` / `toKilometers()`（`src/features/walk/lib/walkRoute.ts`。周回全体の値をそのまま変換するだけで、
  もう片道×2の近似計算〔旧 `estimateRoundTripMinutes()`〕は行わない。当該関数は SS-33 で削除済み）

**Why:** SS-16 時点は「同じ道を戻る」前提で片道×2の近似のまま散歩全体を表示していたが、SS-33 で
実際に周回ルート（往路と異なる復路）を提示するようになったため、近似値と実測値を同じ変数名で
混同しないよう rename した。候補一覧（`SpotCard`）は引き続き近似値のまま据え置いている
（候補ごとに周回を計算すると外部API呼び出しが候補数分に増えコストが見合わないため。
ユーザー確認済みの判断で、両者が僅かにずれることはUIで説明しない）。

**How to apply:** 今後この機能領域（探索・散歩ルート・周回ルート等）のレビューでは、
(1) 表示文言に「片道」「往復」「周回」「目安」のどれが使われているか、(2) その値が
`/explore/places`（近似）と `/explore/routes/loop`（実値）のどちら由来か、(3) 近似値を独自に
2倍/半分にする処理が新設されていないか、を機械的に横断チェックする。
「往復の目安」（`SpotCard` の一覧表示、`/explore/places` 由来）と `WalkRouteSummary`/`WalkActiveView`
の周回表示（`/explore/routes/loop` 由来）は**出典が異なる**ため、数字がわずかに食い違って見えても
即座にバグと判断せず、まずどちらの出典か確認すること。
