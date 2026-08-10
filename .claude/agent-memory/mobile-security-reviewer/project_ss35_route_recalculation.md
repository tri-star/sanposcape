---
name: project_ss35_route_recalculation
description: SS-35（散歩中の現在地起点ルート再計算）セキュリティレビューの要点
type: project
---

SS-35（`tri-star/ss-35`、2026-08-11 レビュー）で `lib/routeDeviation.ts`（逸脱判定）/
`lib/routeRecalculation.ts`（状態機械）/ `hooks/useWalkRouteRecalculation.ts`（副作用層。
fetch + AbortController + 単調増加 sequence）を新設し、散歩中に現在地が表示中ルートから
80m 逸脱したら自動で `POST /explore/routes/walking` を現在地起点で再取得する機能を追加。
Critical/High 指摘なし。

**Why**: 位置情報を使う自動リクエスト発火（ユーザー操作なしでAPIを叩く）の最初の実装であり、
レート制限・AbortController・古い応答の破棄という設計パターンが今後の自動化系機能
（例: 自動チェックポイント、バックグラウンド同期）でも踏襲されるべき基準になるため。

**How to apply**:
- 二重の多重起動防御を確認する規律: (1) `shouldStartRecalculation` が
  `status === "recalculating"` を弾く、(2) `sequence` 不一致の応答（成功/失敗とも）を
  `applyRecalculationSuccess`/`applyRecalculationFailure` が無視する。どちらか一方が
  崩れていないかを優先確認する（新規に非同期状態機械を追加する際の模範実装）。
- レート抑制の4層（逸脱閾値80m×連続2測位 + 最小間隔60秒 + 連続失敗2回で自動停止 +
  再試行不能コード(401/422等)での即時停止）はテストコード
  （`routeRecalculation.test.ts`）で全パターン担保されており、実装が
  `tmp/SS-35/mobile-plan.md` の仕様と完全一致していることをコード・テスト両方で確認済み。
  手動再計算（`recalculate()`）は意図的にこれらの抑制をバイパスするが、ボタン側で
  `disabled={status==="recalculating"}` により連打の多重発火を抑えている
  （React state 更新の非同期性により理論上わずかな race はあるが、悪用可能性なし。
  Low として次回同種実装で再確認）。
- 位置情報・エラーメッセージの座標/内部情報漏洩は無し。`toExploreErrorCode`/
  `isRetriableExploreError` は SS-16/19 から続く既存の分類ロジックを再利用しており、
  サーバー応答の生内容をそのままユーザーに見せない規律が維持されている
  （[[project_ss16_walk_tracking]] / [[project_ss19_walk_finish_save]] と同じ規律）。
- 座標検証: `isOffRoute`/`distanceToRoutePath` は `route.path`/`route.destination.location`
  側のみ `isValidCoordinate` で検証するが、`position`（現在地）自体は未検証。ただし
  `isOffRoute` は先に `distanceMeters(position, destination)`（非有限値なら0を返す実装）を
  評価するため、非有限座標では早期に `false` を返し安全側に倒れることをコードトレースで
  確認済み（実害なし、Low未満）。緯度経度が有限だが範囲外（GPSバグ等）の場合は通常のロジックで
  処理され、backendの422バリデーションに委ねられる。
- 認証境界: `features/walk/lib`・`hooks` とも `services/auth`/`useAuthSessionStore` を
  import しない設計を維持（`.oxlintrc.json` の `no-restricted-imports` が
  `src/features/walk/**` に適用されていることを確認済み）。
- API はクエリパラメータでなく POST body 経由（`origin`/`destination` とも）。URL に
  座標が残らない。
