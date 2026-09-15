---
name: project_ss33_loop_route_review
description: SS-33（周回ルート提示・散歩中の自動再計算撤去）セキュリティレビューの要点
metadata:
  type: project
  scope: task-local
  source_issue: SS-33
---

SS-33（`tri-star/SS-33-claude`、2026-09-15 レビュー）で `POST /explore/routes/loop`
（周回ルート。`WalkRoute.legs`/`returnIsSamePath` を新設）への切り替えと、SS-35で入れた
散歩中の自動ルート再計算（`routeDeviation.ts`/`routeRecalculation.ts`/
`useWalkRouteRecalculation.ts`）の完全撤去を実施。Critical/High/Medium/Low 指摘なし。

**Why**: 「散歩中は自由に歩いてよい・再計算しない」という仕様変更で、位置情報起点の自動API
発火系統（旧 `project_ss35_route_recalculation.md` で模範実装として記録していたもの。実装削除に
伴い当該メモも本 SS-33 対応で除去済み）が丸ごと削除された。
攻撃対象面が純減した珍しいケースであり、今後同種の「自動化機能の撤去」PRをレビューする際の
チェック観点（撤去が本当に完全か・残骸参照がないか）の参考にする。

**How to apply**:
- 撤去系PRでは `grep` で旧関数・旧ファイル名（本件は `routeDeviation`/`routeRecalculation`/
  `useWalkRouteRecalculation`/`walkRouteNotice`/`WalkRouteRecalcStatus`）の残存参照がゼロであることを
  必ず確認する（今回は0件で確認済み）。
- `toWalkRoute`（`lib/walkRoute.ts`）の `pickLegs()` は `leg.kind === "outbound"` のような
  **値マッチ＋件数チェック**でレスポンスのlegsを検証しており、配列添字や型アサーションに依存しない。
  外部API応答（`kind` がunion型でも実行時はJSON由来で信用できない）を検証する際の模範パターンとして、
  次回同種のレビューでも「型ではなく値で数を数えて検証しているか」を優先確認する。
- 座標検証（`isValidCoordinate`: NaN/Infinity・緯度±90/経度±180超え）・数値ガード（`toNonNegative`）・
  bounds不正時のフォールバック計算は SS-16/SS-35 から継続する規律がそのまま legs 単位にも
  適用されている（新規性なし、後退もなし）。
- 新規コンポーネント（`WalkRoutePolylines`/`WalkRouteLegend`）は destination名・place_idを
  一切扱わず「行き/帰り」の定型ラベルのみ表示。[[project_ss16_walk_tracking]] の
  place_id非露出パターンを維持。
- 認証境界（`features/walk/api|lib|hooks` が `services/auth` を import しない）は本PRでも維持。
