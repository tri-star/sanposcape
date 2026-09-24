---
name: project-ss112-pins-edit-delete-complete
description: SS-112（backend: ピンの編集・削除APIと権限マトリクス, BK-5）は実装完了。次はmobile側SS-119
metadata:
  type: project
  scope: task-local
  source_issue: SS-112
---

SS-112「ピンの編集・削除 API と権限マトリクス」の backend 実装は `tri-star/ss-112` ブランチで
完了（2026-09-25）。ADR-009 の積み残し BK-5 を実装した。

- `PATCH /pins/{pin_id}`（`update_pin`）: name/memo の部分更新 + タグの差分適用
  （`add_tags`/`remove_tag_ids`）を1リクエストで原子的に行う。
- `DELETE /pins/{pin_id}`（`delete_pin`）: pins行を CASCADE で削除し、S3 の原本・サムネイルは
  commit 後に best-effort で削除する。
- `DELETE /pins/{pin_id}/photos/{photo_id}`（`delete_pin_photo`）: 写真1枚を削除
  （持ち主はアップロード者本人）。
- `sanpo_maps/permissions.py` に `can_update_pin`/`can_delete_pin`/`can_add_pin_tag`/
  `can_delete_pin_tag`/`can_delete_pin_photo` を追加（owner/対象の作成者本人のeditor/
  作成者ではないeditor/非メンバーの4区分）。
- `ObjectStorage.delete_many()`（S3の`DeleteObjects`、最大1000件/回のチャンク処理）を新設。
- `openapi.yaml` 再生成・契約テスト追加、`docs/adr/ADR-009-...md` に決定19〜24を追補し
  BK-5 を `[x]` にした。

コミット7個（権限関数→例外/スキーマ→repository→S3 delete_many→service/router本体→
OpenAPI→ADR追補の順）、`pytest`974件・`ruff check`/`ruff format --check` すべて green。
手動確認（`STORAGE_MODE=fake`・`AUTH_MODE=dev`でPATCH・両方のDELETEをcurl/httpxで実行し、
`storages/dev-storage`から実体が消えること）も実施済み。

**Why:** 次セッションが未完了事項を拾うための引き継ぎ（task-local）。恒久的な技術パターンは
[[feedback_pydantic_optional_list_and_orm_expire_gotchas]] を参照。

**How to apply:**
- **mobile側（SS-119）が未着手**。PATCH/DELETEのAPI仕様・mobileへの伝達事項は
  `docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md`の
  「追補（2026-09-25, SS-112 編集・削除API）」内「mobile（SS-119）への伝達事項」を参照
  （変更フィールドだけ送る・タグは差分・409 `tag_limit_exceeded`の表示文言など）。
- MVPの実データは owner のみ（招待BK-7が未実装）。editor分岐は現状テストでのみ通る。
- BK-3（期限切れ枠の掃除）に、SS-112の削除APIで残りうる孤立S3オブジェクト
  （締め切り超過・ストレージ障害時の`original/`・`thumb/`）の掃除対象が追加された。
- 本チケットではBK-5範囲外（位置の移動・地図間の移動・招待・`PinRead`へのrole露出・
  定期掃除・アカウント削除時の写真削除）はすべて見送り済み（プラン記載どおり）。
