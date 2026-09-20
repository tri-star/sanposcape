---
name: project-ss33-loop-route-backend-complete
description: SS-33 backend（POST /explore/routes/loop の周回ルート生成）は実装完了。実API検証(B7)のみ未実施
metadata:
  type: project
  scope: task-local
  source_issue: SS-33
---

SS-33 backend（`tri-star/SS-33-claude` ブランチ、2026-09-15完了）: `POST /explore/routes/loop`
を新規実装した。既存 `POST /explore/routes/walking` は `deprecated=True` のみ付与し意味・挙動は不変。

**実装の要点（後続の変更・レビュー時に参照する）:**
- 判定ロジックは `maps/geometry.py`（純粋な幾何関数）と `maps/loop_route.py`（経由点生成・
  4指標判定・スコア選択）に分離。DB/HTTPを持たない純粋関数で、`walks/stats.py` と同じ位置づけ。
- provider 層は既存 `get_walking_route` を拡張せず `get_walking_loop_route` を別メソッドとして
  追加（`ProviderLoopRoute` = outbound/inbound の2 leg）。`client.py`/`fake.py`/`provider.py` 全てに実装。
- `MapsService.get_loop_walking_route` が左右の経由点を `ThreadPoolExecutor(max_workers=2)` で
  並列取得し、スコア最小の合格候補を採用。合格が無ければ 200 + `return_is_same_path=true`
  （エラーにしない）。ログに座標・place_idは出さない。
- 新設定: `GOOGLE_MAPS_LOOP_ROUTE_ENABLED`（既定true、kill switch）、
  `GOOGLE_MAPS_ROUTE_DEADLINE_SECONDS`（既定12秒）。
- ADR: `docs/adr/ADR-007-loop-route-generation.md`（新規）、ADR-001 に SS-33 追補。

**実API検証の結果（2026-09-20 時点）:**
- 実API検証は**実施済み**（当初はこの環境に `GOOGLE_MAPS_SERVER_API_KEY` が無く未実施だった）。
  検証セット全体での同じ道フォールバック率は **69%** で ADR-007 の目標に未達。フォローアップ課題
  **SS-92**（`backend: 周回ルートの生成品質を改善する`）が起票されている。
- しきい値（`maps/loop_route.py` のモジュール定数）は前回スパイク（PR#62）由来の暫定値のまま。
  変更するのは SS-92 の範疇。
- 検証手順は `scripts/loop_route_probe.py` + `scripts/loop_route_probe_cases.yaml`。
  しきい値を動かしたら fake provider の E2E生命線テスト
  （`test_fake_loop_is_accepted_for_every_fake_candidate`）が崩れていないか必ず再確認すること。

関連: [[project-ss44-fake-maps-provider-complete]] / [[project-ss33-loop-route-pitfalls]]（backend-plannerの落とし穴メモ）
