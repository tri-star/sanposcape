---
name: project_ss16_walk_tracking
description: SS-16（散歩ルート提示・散歩中位置トラッキング）セキュリティレビューの要点
type: project
---

SS-16（`feat/ss-16-walk-route`、2026-08-01 レビュー）で `LocationService.watchPosition()`（real/mock）、
`/explore/routes/walking` fetcher（`walkRouteApi.ts`）、`useActiveWalkStore`（Zustand・メモリのみ）、
散歩中の実地図・実トラッキング画面（`WalkActiveView`/`WalkRouteMapView`）を追加。Critical/High 指摘なし。

**Why**: このタスクで確認した設計判断・防御パターンは今後の位置情報系タスク（SS-33 周回ルート等）でも
踏襲されるべき基準になるため、再レビュー時の比較対象として残す。

**How to apply**:
- `watchPosition` の購読リークガードは `useWalkTracking.ts` の `cancelled` フラグパターンが模範実装
  （resolve 前アンマウント時に即 `remove()`）。SS-15 の `useCurrentLocation` と同じ規律。以降このパターンが
  崩れていないか（`cancelled` チェック抜け、cleanup での `remove()` 呼び忘れ）を優先確認する。
- 認証境界: `features/walk/api/*.ts` は `services/auth` を import しない設計を維持している
  （`fetchWalkRoute` で確認）。新規 API 追加時もこの分離が保たれているか要確認。
- place_id 露出防止: `toWalkRoute()` は常に呼び出し側の `fallbackName`（選択カードの表示名）を優先し、
  backend の `destination.name`（place_id フォールバックあり）を直接表示しない設計。新規に destination 名を
  表示する画面を追加する際はこのパターンを踏襲しているか確認する。
- router params で座標・place_id の生値を渡す実装（SS-15 で指摘した [[project_ss15_location_maps]] の軽微指摘）
  は本タスクで `useActiveWalkStore`（メモリ内）経由に置き換えられ解消済み。以後、画面間で座標を渡す新規実装は
  router params ではなく store/Query 経由になっているか確認する。
- 未解消の軽微指摘（次回再確認推奨）:
  1. `toWalkRoute`/`regionForBounds` に緯度経度の非有限値・範囲外値ガードが無い（duration/distanceのみ
     `toNonNegative` 済み）。Low。
  2. `useWalkTracking` は `paused` を effect 依存に含めないため、一時停止中も GPS 監視・現在地表示は継続する
     （距離加算のみ止まる）。仕様意図次第だが Low として記録。
- グローバル認証ルートガード不在は [[project_dev_only_routes_no_guard]] と同一の継続課題（SS-16 で新規悪化なし）。
