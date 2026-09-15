---
name: project_ss33_loop_route
description: SS-33（往路/復路が異なる周回ルート提示・SS-35再計算の撤去）レビュー結果と確立されたパターン
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-008-active-walk-state-and-route-cache.md
---

SS-33（`packages/mobile/src/features/walk/` の周回ルート対応）をレビューし、Critical/Warning 無しの
高品質な実装と判断した（2026-09-15）。

- **やったこと**: `WalkRoute.path`（片道1本）を `legs: [outbound, return]` + `returnIsSamePath` に置き換え、
  `lib/walkRouteLegs.ts`（新規）に「どの線を描くか／凡例に何を出すか／サマリの注記」の分岐を純粋関数として
  集約した。`walkRouteLegendItems` は `walkRoutePolylineSegments` の結果から導出する実装にして、
  線と凡例の kind 集合が構造的に一致することをテスト（`it.each`）で固定している。
  `ActiveWalk.roundTripMinutes/Km` → `loopMinutes/loopKm` に rename（`SpotCandidate.roundTripMinutes` は
  意図的に残置。往復の近似値と周回実値を型で読み分けさせる）。
- **SS-35 の巻き戻しが完全**: 散歩中のルート再計算（`useWalkRouteRecalculation.ts` / `routeDeviation.ts` /
  `routeRecalculation.ts` / `walkRouteNotice.ts` とその `.test.ts`、`.maestro/walk-route-recalculate.yaml`）が
  ファイルごと削除され、grep（`Recalc|recalc|routeDeviation|isOffRoute|toOneWayMinutes|estimateRoundTripMinutes`）
  でも残骸なし。ADR-008 の決定7撤回・決定9新設（往路/復路の到達判定はしない）とコードの実態が一致している。
  - **Why**: 前回試行（PR #62、クローズ済み）は「再計算」と「往路/復路判定」の組み合わせで状態が爆発し
    不具合源になった。ユーザー指示で両方を最初から作らない設計にした。
  - **How to apply**: 今後 SS-33 系のルート機能に触るとき、再計算・往路復路判定を安易に復活させる提案を
    しない。復活させる場合は ADR-008 の再追補が必須（ADR 本文に明記済み）。
- **軽微な指摘（Suggestion のみ）**:
  1. ADR-008 の SS-33 追補「実装ファイル一覧」に `theme/tokens.ts`（`routeReturn` 追加）と
     `RoutePolyline.tsx`（見た目 props 追加）が挙がっていない（本文には言及あり、一覧からの漏れ）。
  2. `theme.map.routeReturn` を Design System（Claude Design "Sanpo Design System"）側へ反映する
     フォローアップが issue化・ADR申し送りされていない（プランの Q3 で「後追いで依頼する」とだけ決めている）。
  3. Android の破線描画フォールバック（`RoutePolyline` の `lineCap`、`WalkRouteLegend` の
     `borderStyle: "dashed"`）はプラン自身が「実機で崩れたら対応」としており未実装のまま。
     実機確認済みかどうかの記録がレビュー時点で見当たらなかった。
- 関連: 今回撤去された機能（SS-35 の現在地起点ルート再計算）の元実装レビューメモ
  `project_ss35_route_recalculation.md` は実装ごと削除されたため本 SS-33 対応で除去した。
  そこにあったパターン知見（Query外ローカルstate+sequence世代管理+純粋関数状態機械）は
  [[local-state-recalc-over-query-pattern]]（`mobile-developer`）に集約済み。
