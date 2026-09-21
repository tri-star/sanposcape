---
name: project-ss88-pins-backend-complete
description: SS-88（backend: 地図/ピン登録・写真アップロード）は実装完了・ローカルレビュー対応済み。BK-1〜BK-10のPlaneチケット起票が未実施
metadata:
  type: project
  scope: task-local
  source_issue: SS-88
---

SS-88「地図（SanpoMap）にピン（Pin）を登録する」の backend 実装は `ss-88` ブランチで
完了（2026-09-21）。sanpo_maps/pins ドメイン新設、4エンドポイント
（`GET /sanpo-maps`・`POST /pin-photo-uploads`・`POST /pins`・`POST /pins/{pin_id}/photos`）、
S3抽象化層（real/fake/unconfigured, `STORAGE_MODE`）、Pillowによる同期サムネイル生成、
`pin_registration`フラグ追加・`app_config_probe`削除、既存サンプル`spots`ドメイン削除
（マイグレーション込み）まで10コミットで完了。同日、backend/architecture/quality/security
各レビューエージェントによるローカルレビュー指摘（写真付き冪等リトライの409化・
確定処理の並列化漏れ・容量チェックの並行性ギャップ等、9件）にも対応済み（追加7コミット、
`pytest`697件・`ruff`すべてgreen）。設計判断の一次記録は
`docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md`。

**Why:** このメモリは次セッションが未完了事項を拾うための引き継ぎ（task-local）。
恒久的な技術パターンは [[feedback-boto3-s3-and-pg-advisory-lock-gotchas]]・
[[feedback_true_concurrency_test_pattern]] を参照。

**How to apply:**
- **`template.yaml`は変更していない**（B-U1。infra側SS-106/107のdev apply待ち）。
  dev/staging/productionでは写真ありのAPIが503を返すのみ（フラグOFFなので実害無し）。
- **BK-1〜BK-10のPlaneチケット起票が未実施**。backend-developerセッションはPlaneツールに
  アクセスできなかったため、コーディネーターが起票すること。内容はADR-009「移行・対応が
  必要な事項」に列挙済み。
- mobile側の実装（`features/pin/`）は同じ`ss-88`ブランチでbackendの後に完了済み
  （2026-09-21、mobile-developer）。
- mobile実装時に参照すべき挙動の差分: `POST /pins`の冪等再送（200）は`client_pin_id`が
  一致した時点で内容を検証せず既存ピンをそのまま返す（`sanpo_map_id`不一致・写真未紐付け
  でも早期リターン）。`POST /pins/{pin_id}/photos`の応答`items`はリクエストした
  `photo_upload_ids`の順（既存紐付け分・新規分の両方を含む）。`GET /sanpo-maps`に
  ピン件数は含まれない（ADR-009決定3）。
- ローカルレビュー対応で修正した重要な挙動変更（mobileには影響しない内部実装のみ）:
  `PhotoAttacher.prepare()`/`commit()`は`deadline_seconds`ではなく共有の`deadline_at`
  （`compute_deadline()`で算出）を受け取るようになった。`PinPhotoUploadRepository.
  find_attachment(upload_id)`は`find_attachments(user_id, upload_ids)`（バッチ・
  user_idスコープ）に置き換わった。API契約（openapi.yaml）は無変更（再生成してdiff無しを
  確認済み）。
