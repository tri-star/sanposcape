---
name: walk-location-review-checklist
description: 散歩・位置情報系(ルート提示・散歩中トラッキング・周回ルート)のセキュリティレビュー観点(SS-16/SS-33のレビュー結果を統合)。watchPositionリークガード・place_id非露出・外部応答の値マッチ検証・撤去系PRの残骸確認
metadata:
  type: feedback
  scope: durable
  adr: packages/mobile/adr/ADR-M-008-active-walk-state-and-route-cache.md
---

設計判断の正本は `packages/mobile/adr/ADR-M-008-active-walk-state-and-route-cache.md`
（進行中の散歩の状態・ルートキャッシュ・SS-33 で撤回した散歩中の自動再計算）と
`packages/mobile/adr/ADR-M-006-location-service-real-mock.md`。

## レビュー時に確認すること

1. **watchPosition の購読リーク**: `useWalkTracking.ts` の `cancelled` フラグパターンが模範
   （resolve 前にアンマウントされたら即 `remove()`）。`cancelled` チェック抜け、cleanup での
   `remove()` 呼び忘れが無いか。
2. **認証境界**: `features/walk/api|lib|hooks` が `services/auth` を import していないか
   （oxlint の `no-restricted-imports` でも担保）。
3. **place_id 非露出**: destination 名は呼び出し側の表示名（`fallbackName`）を優先し、backend の
   `destination.name`（place_id フォールバックあり）を直接表示しない。新規に目的地名を出す画面で確認。
4. **画面間の座標受け渡し**: 生の座標を router params で渡さず store / Query 経由にしているか
   （SS-16 で `useActiveWalkStore` 経由に置き換え済み）。ピン登録系の例外は
   [[pin-and-route-param-review-checklist]]。
5. **外部 API 応答の検証は型ではなく値で**: `lib/walkRoute.ts` の `pickLegs()` は
   `leg.kind === "outbound"` のような値マッチ＋件数チェックで legs を検証し、添字や型アサーションに
   依存しない。JSON 由来の union 型は実行時に信用できない前提で見る。座標は `isValidCoordinate`
   （NaN/Infinity・緯度±90/経度±180）、数値は `toNonNegative` で守られているか。
6. **撤去系 PR**: 旧関数・旧ファイル名の残存参照が grep で0件か確認する
   （SS-33 では `routeDeviation` / `routeRecalculation` / `useWalkRouteRecalculation` /
   `walkRouteNotice` / `WalkRouteRecalcStatus`。いずれも削除済みで、存在しないのが正しい）。
   位置情報起点の自動 API 発火の撤去は攻撃対象面の純減として評価してよい。
7. **ログ・エラー文言**: `console.*` に座標・トークンが出ていないか。エラーはステータスコードで分類し
   固定文言のみ（`exploreError.ts` / `walkSaveError.ts` / `walkStatsError.ts` の規律）。
   HTTP は `customFetch` 経由か、生成物（`src/api/generated/`）を手編集していないか。

関連: [[project_ss19_walk_finish_save]]（散歩記録の保存・送信整形）
