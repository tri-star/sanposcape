---
name: project_ss113_sanpo_maps_management_review
description: SS-113（地図の新規作成・管理API、POST/PATCH/DELETE /sanpo-maps、GET /sanpo-maps?expand=pin_count）のコードレビュー所見。B-D参照以外は概ね良好。
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md
---

SS-113（ADR-009 決定25〜29, BK-6完了）のレビュー結果（2026-09-26時点）。

**見つかった問題は [[antipattern_plan_decision_refs]] の再発のみ**（`sanpo_maps/mappers.py:19`
の `B-D2`、`sanpo_maps/service.py:43` の `B-D1`）で Medium 止まり。それ以外の観点はすべて良好:

- `pins/repository.py::count_pins_for_maps()` は `IN (:ids) GROUP BY sanpo_map_id` の単一クエリ、
  空リストガードあり。N+1なし。
- `pins/repository.py::list_photo_keys_for_map()` は列だけSELECT（エンティティ全体を読まない）。
  地図単位でも [[pattern_partial_deadline_guard]] や SS-112の時間予算実装（
  `PinService._delete_photo_keys_best_effort`）をそのまま再利用しており、新しい削除部品・
  設定値を増やしていない。
- 依存方向（`sanpo_maps` が `pins` を import しない）は `sanpo_maps/contents.py` の Protocol +
  `sanpo_maps/tests/test_dependency_direction.py`（AST解析、走査対象が空にならないことの番兵
  テストつき）で機械的に担保されている。
- commit前にORM属性をローカル変数へ退避してから `delete()`→`commit()`→`cleanup()` する順序は
  [[pattern_expired_orm_attr_in_post_commit_log]] のR2規律を正しく踏襲。
- テスト網羅性（`sanpo_maps/tests/`・`pins/tests/test_sanpo_map_management.py`）はCASCADE・
  S3削除・staging温存・容量解放・Unconfigured時204・IDOR・既定地図の繰り上げをほぼ計画の
  完了条件どおりに固定しており抜けなし。

**Why:** 次にこのドメイン（`sanpo_maps/`・`pins/`）や同種のport/Protocol設計を見るとき、
「B-D参照の再発」以外は探索コストをかけずに信頼してよい基準として記録する。

**How to apply:** `sanpo_maps/` か `pins/` の新しいPRをレビューするときは、まず新規/変更ファイルの
コメントに `B-D\d+` や計画書ラベルが無いかを最初にgrepする（[[antipattern_plan_decision_refs]]
参照）。それ以外の設計（port経由の依存逆転・削除の時間予算・GROUP BY集計）は既に確立ずみの
パターンなので、新規逸脱がないかの確認に絞ってよい。
