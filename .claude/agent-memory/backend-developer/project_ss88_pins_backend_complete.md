---
name: project-ss88-pins-backend-complete
description: SS-88（backend: 地図/ピン登録・写真アップロード）は実装完了。BK-1〜BK-10のPlaneチケット起票が未実施
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
（マイグレーション込み）まで10コミットで完了。`pytest`689件・`ruff`すべてgreen。
設計判断の一次記録は `docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md`。

**Why:** このメモリは次セッションが未完了事項を拾うための引き継ぎ（task-local）。
恒久的な技術パターンは [[feedback-boto3-s3-and-pg-advisory-lock-gotchas]] を参照。

**How to apply:**
- **`template.yaml`は変更していない**（B-U1。infra側SS-106/107のdev apply待ち）。
  dev/staging/productionでは写真ありのAPIが503を返すのみ（フラグOFFなので実害無し）。
- **BK-1〜BK-10のPlaneチケット起票が未実施**。backend-developerセッションはPlaneツールに
  アクセスできなかったため、コーディネーターが起票すること。内容はADR-009「移行・対応が
  必要な事項」に列挙済み。
- mobile側の実装（Orval再生成、`features/spot/`相当の`pin`への読み替え）はこのPRの
  マージ後に着手する前提（mobile-planner側の申し送りどおり）。
- mobile実装時に参照すべき挙動の差分: `POST /pins`の冪等再送（200）は`client_pin_id`が
  一致した時点で内容を検証せず既存ピンをそのまま返す（`sanpo_map_id`不一致・写真未紐付け
  でも早期リターン）。`POST /pins/{pin_id}/photos`の応答`items`はリクエストした
  `photo_upload_ids`の順（既存紐付け分・新規分の両方を含む）。`GET /sanpo-maps`に
  ピン件数は含まれない（ADR-009決定3）。
