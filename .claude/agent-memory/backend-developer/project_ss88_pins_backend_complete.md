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

**追記（2026-09-21, PR #93 Copilotレビュー対応, backend分）:**
- 対応済み: T2（`/dev-storage`本文サイズ制限）・T3（`PhotoAttacher.commit`のPut後/集約後の
  締切チェック）・T4（`cleanup_staging`にも締切適用）・T5（タグ長を正規化後に検証、
  `PinTagLabel.max_length` 20→200・公開上限20は`tag_labels.dedupe_tags()`側）・T6
  （`Image.DecompressionBombError`を`InvalidImageError`に正規化）・T11（`DELETE
  /pin-photo-uploads/{upload_id}`新設、`operationId: delete_pin_photo_upload`）・T15
  （pins系409に機械可読`code`: `storage_quota_exceeded`|`photo_upload_not_ready`、
  `PinConflictErrorRead`スキーマ追加）。コミットは`ss-88`に7個（T2→T3→T4→T5→T15→T11→T6の順。
  T6の回帰テストがT15の`code`フィールドをアサートするため、T15を先にした）。
  `pytest`は697→721件、`ruff`すべてgreen。設計判断はADR-009「追補（PR #93レビュー対応）」
  （決定11・決定12）に記録済み。
- 対応見送り（mobile側）: T1（RN fetchのredirect制約, コメント修正のみ）・T7（写真グリッド
  仮想化, 別チケット）・T14（任意座標登録, SS-124で対応）。T8〜T10・T12・T13・T16・T17は
  mobile-developer側の担当（本セッションでは`packages/mobile/**`に触れていない）。
- mobile申し送り: `PinTagLabel`のOrval生成型`maxLength`が20→200に変わる（正規化後の20文字
  制限はmobile側の実装のまま据え置きでよい）。`DELETE /pin-photo-uploads/{upload_id}`
  （Orval生成名は恐らく`deletePinPhotoUpload`）を`usePinPhotos.ts`の`removePhoto`から
  best-effortで呼ぶ想定。`pinSaveError.ts`の409分類を応答本体の`code`で分岐できるようになった
  （`ApiError`/`customFetch`がJSON bodyを保持する改修が必要かはmobile側の実装次第）。
