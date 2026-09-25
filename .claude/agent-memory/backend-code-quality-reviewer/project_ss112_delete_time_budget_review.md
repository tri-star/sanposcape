---
name: project_ss112_delete_time_budget_review
description: SS-112 PR#101レビューC1（削除S3後始末の時間予算未有界化）対応の実装確認結果。config.py↔s3.pyの定数整合性テストはローカルレビューR1で追加済み。
metadata:
  type: project
  scope: task-local
  source_issue: SS-112
---

`packages/backend/src/sanposcape/pins/service.py::_delete_photo_keys_best_effort` の
時間予算バグ（PR #101 レビューC1、`pattern_partial_deadline_guard` と同系統の指摘）への対応
（2026-09-26時点、`tri-star/ss-112` ブランチ）をレビューした結果。

**対応内容（計画通り実装済みを確認）**:
- `S3ObjectStorage` に削除専用 client を追加（`total_max_attempts=1`、短いtimeout）。
  通常clientと分離し、`client=`のみ注入時は削除にも同じclientを使う後方互換規則あり。
- `_delete_photo_keys_best_effort` の打ち切り判定: 最初のチャンクは無条件に実行、
  2つ目以降は `remaining >= worst_case` のときだけ開始。境界値（remaining==worst_case、
  remaining<worst_case、チャンク1つのみ）がすべて個別テストで固定済み
  (`pins/tests/test_service.py::TestPinServiceDeleteTimeBudget`)。
- `Settings` に `pin_photo_delete_deadline_seconds`(le=20) + `object_storage_delete_call_worst_case_seconds`
  (= delete_connect_timeout + delete_read_timeout) の和が `_REQUEST_TIME_BUDGET_SECONDS=25` を
  超えないことを env 問わず起動時検証。境界値テストあり。

**指摘した弱点（Important、Medium級）→ ローカルレビューR1で解消済み**:
`Settings.object_storage_delete_call_worst_case_seconds` は
`integrations/aws/s3.py` の `_DELETE_TOTAL_MAX_ATTEMPTS = 1`（バックオフなし前提）に
依存しているが、config.py は s3.py を import できない（逆依存になるため）ので、
コメントでの相互参照のみで、両者の整合性を直接検証するテストが無かった。
R1対応で、定数の定義直後（`s3.py`）と `object_storage_delete_call_worst_case_seconds`
の docstring（`config.py`）の両方に相互参照コメントを追加し、
`integrations/aws/tests/test_s3.py::test_delete_total_max_attempts_is_one` で
`_DELETE_TOTAL_MAX_ATTEMPTS == 1` を直接固定した（失敗メッセージに「worst_caseの式も
見直すこと」と明記）。

**How to apply**: 今後 `_DELETE_TOTAL_MAX_ATTEMPTS` や類似の「他モジュールの定数を前提にした
時間予算計算」を見たら、その前提を直接固定するテスト（例: `assert s3_module._DELETE_TOTAL_MAX_ATTEMPTS == 1`）
の有無を確認する。無ければ指摘してよい（この指摘パターン自体は今後も有効。SS-112では対応済みという
記録として本メモリを残す）。関連: [[pattern_partial_deadline_guard]]。

**pattern_partial_deadline_guard との関係**: `pins/service.py` の削除経路（`delete_pin`/`delete_photo`
→ `_delete_photo_keys_best_effort`）はSS-112で対称的な締め切り保護に修正済み。
一方 `pins/photo_attacher.py` の `commit()`/`cleanup_staging()`（確定処理側）は、
本対応のスコープ外として意図的に残されている。「確定処理は503で再送できる設計で、C1の
指摘対象ではない」というユーザー決定は ADR-009 決定22 追補（2026-09-26）に記録済み。
次にこのファイルをレビューする際は「まだ直っていない」という前提で良い。
