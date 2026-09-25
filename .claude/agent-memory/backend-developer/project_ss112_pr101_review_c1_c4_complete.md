---
name: project-ss112-pr101-review-c1-c4-complete
description: SS-112 PR #101 の Copilot レビュー指摘 C1〜C4（削除の時間予算・権限マトリクスとdocsの記述不一致）は実装完了
metadata:
  type: project
  scope: task-local
  source_issue: SS-112
---

PR #101（ピン編集・削除 API と権限マトリクス）への Copilot レビュー指摘4件（C1: 削除の
S3後始末が時間予算を超えうる（高）、C2: 権限判定関数の形の説明が実装と不一致（中）、
C3・C4: `deployment.md`/`local-env.md` で PATCH を「削除系」に含めていた誤り（中））に、
`tri-star/ss-112` ブランチで対応完了（2026-09-26）。

**Why:** 次セッションが「C1〜C4対応済み」と誤って再着手しないための引き継ぎ（task-local）。
恒久的な設計パターンは backend-planner の [[feedback_deadline_must_budget_inflight_call]]
を参照。

**How to apply:**
- **C1 の設計**: `S3ObjectStorage` に削除専用の boto3 client（`_delete_client`,
  `total_max_attempts=1`）を追加し、`delete()`/`delete_many()` をそちらへ向けた。
  client の解決規則は「`delete_client` 明示 > `client` を共用 > 新規作成」の3段階。
  `PinService._delete_photo_keys_best_effort` は最初のチャンクを必ず試み、2つ目以降は
  「残り時間 ≥ `Settings.object_storage_delete_call_worst_case_seconds`」のときだけ
  始める。この worst_case は `delete_connect_timeout + delete_read_timeout`（既定6秒）
  で、`s3.py` の `_DELETE_TOTAL_MAX_ATTEMPTS=1`（バックオフ無し）が前提。
  `Settings._validate_environment_settings` で「締め切り + worst_case ≤ 25秒」を
  env を問わず検証する（`pin_photo_delete_deadline_seconds` の Field 上限も 25→20）。
- **旧テスト `test_delete_deadline_exceeded_skips_remaining_and_warns` は削除**し、
  `TestPinServiceDeleteTimeBudget`（写真2枚・`S3_DELETE_OBJECTS_MAX_KEYS`を2にmonkeypatch
  してチャンク2つに分割）に置き換えた。写真1枚のピン削除は常に1チャンクで終わるため、
  締め切りに関係なく必ず S3 削除が試みられるようになった（旧仕様と逆転した挙動）。
- **C2〜C4**: ADR-009 決定19・決定22、`naming-convention.md`・`folder-structure.md`・
  `permissions.py` のモジュール docstring、`deployment.md`・`local-env.md` を実装に
  合わせて修正。追加系（`can_add_pin`/`can_add_pin_photo`/`can_add_pin_tag`）は
  `is_creator` を持たないので「すべて同じ形」という説明は誤りだった。PATCH は S3 を
  操作しないので「削除系」に含めるのは誤りだった。
- API 契約（`openapi.yaml`）は無変更（再生成して diff 無しを確認済み）。mobile 側への
  影響は無い。
- **返信・resolve は未実施**（レビュースレッド4件とも、ユーザー承認後にコーディネーターが
  対応・resolve する予定）。
- **見送り事項**: 確定処理（`pin_photo_confirm_deadline_seconds`）にも同じ「呼ぶ前だけ
  確認」の構造が残るが、確定処理は503→再送で回復するため今回は直していない。削除処理を
  リクエスト外（EventBridge等）へ移す案はユーザー決定でスコープ外、Plane SS-134
  （Backlog, low）として起票済み。
