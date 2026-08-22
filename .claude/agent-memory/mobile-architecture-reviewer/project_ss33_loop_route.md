---
name: project_ss33_loop_route
description: SS-33 散歩ルート周回化（往路/復路2leg・legPhase判定・復路one_way再計算）のレビュー知見
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-008-active-walk-state-and-route-cache.md
---

SS-33（`tri-star/SS-33` ブランチ、mobile側7コミット）は「/explore/routes/walking のレスポンスを片道から
周回（往路+復路2leg）へ拡張し、地図上で描き分け・往路/復路バッジ表示・復路は出発地への片道で再計算する」機能。
事前に用意された詳細なプランと backend 契約確定内容を突き合わせた結果、実装はプランに忠実で差分はほぼ無い。
参照実装として質が高い。

**確認した設計どおりの点（指摘ではない）**:
- 判定の入口一本化: `hasDistinctLegs()`/`findWalkRouteLeg()` が唯一の入口。`route.legs.length` を直接見る
  箇所は `hasDistinctLegs` 自体の実装1箇所のみ（grep で確認済み）。`response.route_type` を読む箇所はゼロ
  （`toWalkRoute` はコメントで「意図的に無視」と明記し、`walkRoute.test.ts` に固定テストあり）。
- 表示文言: `resolveDestinationName`（`lib/walkRoute.ts`）が「呼び出し側→レスポンス→"目的地"」の三段。
  `RETURN_TO_START_DESTINATION_NAME`（`lib/walkRouteRequest.ts`）をリクエストの`destination.name`と
  `fetchWalkRoute`の`destinationName`の両方に渡す二重化も実装どおり。
- SS-35整合: `useWalkRouteRecalculation` は `legPhase` で `buildWalkingRouteRequest({routeType:"loop"})` と
  `buildReturnToStartRouteRequest`（one_way, destination=ActiveWalk.origin）を送り分け。
  `isOffRoute` は周回全体の`route.path`、`walkRouteFitKey`に目的地座標を追加、ADR-008決定7に反映済み。
- `observeWalkLeg`（`lib/walkRouteLeg.ts`）: 目的地到達ラッチを主・両leg投影を従、フェーズ単調という
  設計どおりの実装。参照透過性（値不変なら同一参照を返す）もテストで固定。

**Warning（P2程度。今回初めて見つけた設計ギャップ、要議論）**:
- `useWalkLegPhase` への入力を`route.walkRoute`（初期ルート=Query由来のbaseRoute）に固定し、
  `useActiveWalk.ts:94-98` のコメントは「再計算後の片道ルートにはlegsが無く、判定は目的地到達ラッチだけで
  足りるため実害が無い」とだけ説明している。これは**復路（return）の再計算**（one_way・legs空）にのみ
  当てはまる理屈で、**往路（outbound）の再計算**（deviation時に`routeType:"loop"`で現在地起点の新ルートを
  再取得。新ルートは新しいlegsを持つ）のケースが未検討・未文書化。
  outbound再計算後も`observeWalkLeg`の投影判定（`lib/walkRouteLeg.ts`の6-7番目のステップ）は**古い
  baseRouteのleg折れ線**に対して距離比較を行い続け、実際に表示されている新しい`recalc.route`のlegとは
  無関係な判定になる。目的地到達ラッチ（主）が最終的に上書きするため機能的破綻はないが、
  「往路/復路バッジ」と地図上のstrokeWidth強調（`WalkRouteLegPolylines`の`activeLeg`）が、
  deviation〜destination到達までの間、理屈上ズレうる（実害は軽微〜中: UI表示の一時的な不正確さ）。
  次にこの領域を触るときは、(a) 実害が本当に軽微か実機/手動確認する、(b) 少なくとも
  `useActiveWalk.ts`のコメントに「outbound再計算時は古いlegとの比較になる」トレードオフを明記する、
  のいずれかを推奨。

**Suggestion（軽微）**:
- `useMapRouteFit.ts:35` の `eslint-disable` コメントが「walkRouteFitKey（placeId+origin）」のままで、
  同ファイル上部のJSDoc（21行目、`placeId + origin + destination座標`に更新済み）と表記が食い違う
  （SS-33で`walkRouteFitKey`に目的地座標が追加されたのに、disableコメントだけ更新漏れ）。

参照ファイル: `packages/mobile/src/features/walk/lib/{walkRoute,walkRouteLeg,walkRouteRequest,routeDeviation}.ts`、
`packages/mobile/src/features/walk/hooks/{useWalkLegPhase,useWalkRouteRecalculation,useActiveWalk,useMapRouteFit}.ts`、
`packages/mobile/src/features/walk/components/{WalkRouteLegPolylines,WalkRouteMapView,SpotMapView,WalkRouteSummary,WalkActiveView,WalkStartView}.tsx`、
`packages/mobile/adr/ADR-008-active-walk-state-and-route-cache.md`（決定2・決定7 SS-33追補）、
`docs/adr/ADR-001-map-poi-google-maps-platform.md`（SS-33追補）。
