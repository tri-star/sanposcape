---
name: project_ss113_sanpo_maps_management_review
description: SS-113（地図の新規作成・管理API、POST/PATCH/DELETE /sanpo-maps、GET /sanpo-maps?expand=pin_count）のコードレビュー所見。B-D参照の再発は同PRで修正済み。既定地図の同時実行はPR #103指摘で追加対応済み。
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md
---

SS-113（ADR-009 決定25〜29, BK-6完了）のレビュー結果（2026-09-26時点。2026-09-27 PR #103の
Copilotレビュー対応を反映して更新）。

**当初見つかった問題は [[antipattern_plan_decision_refs]] の再発のみ**（`sanpo_maps/mappers.py:19`
の `B-D2`、`sanpo_maps/service.py:43` の `B-D1`）で Medium 止まり。**この再発は同じ PR 内の
コミット `28777e0`（ローカルレビュー対応）で、ADR-009 の決定番号の参照（決定3・決定29）に
修正済み**。未解決の指摘ではない。それ以外の観点は以下のとおり良好:

- `pins/repository.py::count_pins_for_maps()`（**SS-137 追補**: `sanpo_maps/maps/repository.py`
  へ移動）は `IN (:ids) GROUP BY sanpo_map_id` の単一クエリ、空リストガードあり。N+1なし。
- `pins/repository.py::list_photo_keys_for_map()`（**SS-137 追補**: 同上、`sanpo_maps/maps/
  repository.py` へ移動）は列だけSELECT（エンティティ全体を読まない）。
  地図単位でも [[pattern_partial_deadline_guard]] や SS-112の時間予算実装（
  `PinService._delete_photo_keys_best_effort`）をそのまま再利用しており、新しい削除部品・
  設定値を増やしていない。
- 依存方向（`sanpo_maps` が `pins` を import しない）は `SanpoMapContents` の Protocol + 旧
  test_dependency_direction（AST解析、走査対象が空にならないことの番兵テストつき）で機械的に
  担保されていた。**SS-137 追補**: `pins` を `sanpo_maps` 配下へ統合し、port は撤去。依存方向は
  `sanpo_maps/tests/test_architecture.py`（M1〜M9, ADR-011）が引き続き AST で担保している。
- commit前にORM属性をローカル変数へ退避してから `delete()`→`commit()`→`cleanup()` する順序は
  [[pattern_expired_orm_attr_in_post_commit_log]] のR2規律を正しく踏襲。
- テスト網羅性（`sanpo_maps/tests/`・`sanpo_maps/maps/tests/test_sanpo_map_management.py`。
  **SS-137 追補**: 旧 pins/tests/test_sanpo_map_management.py）はCASCADE・
  S3削除・staging温存・容量解放・Unconfigured時204・IDOR・既定地図の繰り上げをほぼ計画の
  完了条件どおりに固定しており抜けなし。

**このローカルレビューでは見逃した観点（PR #103のCopilotレビューで発覚）**: 既定地図の不変条件
（「owner ごとに既定地図はちょうど1つ」）が、同じ owner の `create_map`/`delete_map` の同時実行
（例: 唯一の既定地図の `DELETE` と `POST /sanpo-maps` が交差する、既定地図Aの削除と非既定Bの
削除が交差する）で崩れる穴を、上記のテスト網羅性チェックだけでは検出できなかった。
`repository.py::promote_latest_to_default()` の `UPDATE` がrowcountを確認していない点、
`service.py::create_map()`/`delete_map()` が判定から commit までをロックなしで行っている点は、
「テストが通っている」ことと「並行実行で不変条件が崩れないこと」が別の観点であるにも関わらず、
レビュー時にこの区別を明示的にチェックしていなかったのが原因。対応は owner 単位の
`pg_advisory_xact_lock`（`SanpoMapRepository.lock_owner()`）による直列化（ADR-009 決定27
追補, 2026-09-27）。

**Why:** 次にこのドメイン（`sanpo_maps/`・`pins/`）や同種のport/Protocol設計を見るとき、
「B-D参照の再発」は既に片付いている前提で探索コストをかけずに進めてよい。一方、**「不変条件を
守る一意インデックス・部分一意インデックスがあるからOK」と判断する前に、判定（SELECT）から
書き込み（INSERT/UPDATE/DELETE）・commitまでの区間がロックで直列化されているか、
一意制約だけで守れる方向（例:「既定が2つ」）と守れない方向（例:「既定が0」）を区別できているか
を確認する**ことを、既定値・フラグ的な列（`is_default`等）を持つドメインのレビュー観点として
追加する。

**How to apply:**
- `sanpo_maps/` か `pins/` の新しいPRをレビューするときは、まず新規/変更ファイルの
  コメントに `B-D\d+` や計画書ラベルが無いかを最初にgrepする（[[antipattern_plan_decision_refs]]
  参照）。それ以外の設計（port経由の依存逆転・削除の時間予算・GROUP BY集計）は既に確立ずみの
  パターンなので、新規逸脱がないかの確認に絞ってよい。
- **「唯一」「ちょうど1つ」を保証する不変条件（既定地図等）を書き込むメソッドがある場合は、
  部分一意インデックスが防げる方向（増える方向）と防げない方向（消える方向）を分けて考え、
  防げない方向の直列化手段（advisory lock 等）があるかを確認する。** `UPDATE`/`DELETE` の
  rowcountを見ずに成功扱いしている箇所（「選んだ候補が実行時に既に無くなっている」ケースを
  無視していないか）も合わせて確認する。
