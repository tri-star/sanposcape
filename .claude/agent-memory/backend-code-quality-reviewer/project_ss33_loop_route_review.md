---
name: project_ss33_loop_route_review
description: SS-33（周回ルート生成）backendレビューの概要。spike実測値のコード転記という模範パターンと、見つかった軽微なテストギャップ。
metadata:
  type: project
  scope: task-local
  source_issue: SS-33
---

SS-33（ブランチ `tri-star/SS-33`、2026-08-22 レビュー）は `POST /explore/routes/walking` を片道から周回
（現在地→目的地→別経路→現在地）へ拡張する変更。新規 `maps/geometry.py`（純粋関数・242行）+
`maps/service.py` の周回オーケストレーション（右→左の経由点再試行→フォールバック）+
`integrations/google_maps/` の `intermediates`/`legs` 対応。設計判断は
`docs/adr/ADR-001-map-poi-google-maps-platform.md` の2026-08-22追補が正本。

**Critical/High 相当の指摘なし**。実装は事前の実装プランに忠実で、境界条件（ゼロ除算・極付近・
日付変更線・空/単一点の折れ線）に対する防御がほぼ全てテストで担保されている。

**模範パターンとして特筆**: `maps/geometry.py` の `WAYPOINT_OFFSET_RATIO=0.25` /
`MAX_RETURN_TO_OUTBOUND_RATIO=1.8` / `MAX_TOTAL_TO_STRAIGHT_RATIO=1.4` / `MAX_PATH_OVERLAP_RATIO=0.6`、
`config.py` の `GOOGLE_MAPS_LOOP_DURATION_FACTOR=1.15` の**いずれも、実測日・サンプル数・最悪ケースの
数値・なぜその値を選んだか（誤差の非対称性など）がコード上のコメントに転記されている**（実測値は
実 Google Routes API への108試行スパイクに基づく）。次にドメイン固有の経験的定数（閾値・係数）が
出てきたら、このファイルのコメントの書き方を「良い例」として参照してよい。

**見つかった軽微なギャップ（Lowで指摘）**:
- `maps/tests/test_geometry.py` の `evaluate_loop` 境界テストは ret比(1.8)/total比(1.4) は
  ちょうど境界値で「通す/落とす」両方をテストしているが、`path_overlap_ratio`(0.6) だけは
  0.0（通る）と1.0（落ちる）の両極端しかテストしておらず、閾値ちょうど付近（実測最悪値0.568相当）
  の境界テストが無い。
- `client.py._parse_route_with_legs` の `routes.duration` と Σlegs の乖離が5秒を超えたときの
  `logger.warning` にテストが無い（挙動そのものはログのみで応答は変えないため実害は小さい）。

**関連**: [[antipattern_plan_decision_refs]]（`geometry.py` のコメントは decision code の記号だけでなく
実測値を転記しているため、このアンチパターンには該当しない＝良い例）。
