---
name: project_ss112_pins_edit_delete_review
description: SS-112（ピンのPATCH/DELETE API・権限マトリクス・ObjectStorage.delete_many）レビュー概要。2026-09-25時点の実装状況と唯一のImportant指摘。
metadata:
  type: project
  scope: task-local
  source_issue: SS-112
---

`packages/backend` の SS-112（`PATCH /pins/{pin_id}`・`DELETE /pins/{pin_id}`・
`DELETE /pins/{pin_id}/photos/{photo_id}`・`sanpo_maps/permissions.py` の権限マトリクス・
`ObjectStorage.delete_many`）を、実装プラン（権限マトリクス確定・PATCHの差分更新・
S3削除の締め切り設計）と ADR-009 追補（決定19〜24）に沿ってレビュー（2026-09-25）。

**結論**: Critical/Important な設計上の欠陥なし。権限マトリクス（全組み合わせ
`sanpo_maps/tests/test_permissions.py` でパラメトライズ済み）、404/403の使い分け（IDOR対策）、
DB commit→S3 best-effort削除の順序（決定4維持）、`delete_many` のチャンク分割・締め切り
（`monotonic()`基準、`PIN_PHOTO_DELETE_DEADLINE_SECONDS`）、S3障害・Unconfigured時も204を返す
ことまで、プランどおり実装されテストで固定されている
（`test_delete_deadline_exceeded_skips_remaining_and_warns`、`test_tag_limit_exceeded_rolls_back`、
`TestPinEditPermissionMatrix`、`test_s3.py::TestDeleteMany`）。

**唯一の Important 指摘**: [[pattern_expired_orm_attr_in_post_commit_log]]
（`delete_pin`/`delete_photo` が commit後に `pin.id`/`current_user.id`/`photo.id` をログに
使っており、`expire_on_commit=True` により不要なSELECTを誘発する）。

**Why**: BK-5（ADR-009の積み残し）の完了チケット。後続 SS-119（mobile側の編集・削除UI）が
このAPIに依存する。

**How to apply**: SS-119 や関連チケットで pins/service.py にさらに手を入れる際は、上記の
Important指摘（commit後のORM属性アクセス）が直っているか、また今回確立された
「権限は送られたフィールド単位で判定し1つでもNGなら全体403」「タグは差分形式
（add_tags/remove_tag_ids）」という規約に新しい変更が沿っているかを確認する。
