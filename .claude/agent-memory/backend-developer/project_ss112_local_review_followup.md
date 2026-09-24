---
name: project-ss112-local-review-followup
description: SS-112 ローカルレビュー（R1〜R7・D1〜D6）対応完了。commit後のORM属性アクセス修正・delete_many定数化・ADR/docs更新の対応箇所
metadata:
  type: project
  scope: task-local
  source_issue: SS-112
---

[[project-ss112-pins-edit-delete-complete]] の実装完了後、architecture/code-quality/security/
doc-maintainer によるローカルレビューの指摘 R1〜R7・D1〜D6 すべてに対応した
（2026-09-25、ユーザー承認済み。R8 は許容として見送り）。

**Why:** 次セッションが同種の指摘（特に R2 のパターン）を繰り返さないための記録。

**How to apply:**
- **R2（Important）**: `pins/service.py` の `create_pin`/`update_pin`/`delete_pin`/
  `delete_photo` で、commit 後に ORM 属性（`pin.id`/`current_user.id`/`photo.id`）へ
  アクセスしていたのを修正した。詳細な技術的背景は
  [[feedback_pydantic_optional_list_and_orm_expire_gotchas]] の「2.」を参照
  （`backend-code-quality-reviewer` の [[pattern_expired_orm_attr_in_post_commit_log]] が
  発見元）。**pins/service.py に今後手を入れる際は、commit 後に ORM オブジェクトの属性へ
  直接アクセスしていないか必ず確認すること**（引数の ID かローカル変数を使う）。
- **R3**: `_delete_photo_keys_best_effort` の `except` を `ObjectStorageUnavailableError`
  から `except Exception` に広げた（commit後のbest-effort境界のため、想定外の例外で
  500を返さないようにする）。
- **R4**: `S3_DELETE_OBJECTS_MAX_KEYS = 1000` を `integrations/aws/s3.py` に定数化。
  `delete_many()`（S3実装）と `pins/service.py` の締め切りチェックのチャンクサイズの
  両方から参照する。
- **R6**: ADR決定19の権限マトリクス表は「操作の一覧」であり実行順を意味しないことを
  決定20に明記した。コード（`update_pin` の remove→add の順）は変更していない
  （決定20の「適用順序は削除→追加→件数チェック」と既に整合していたため）。
- **D1〜D6**: `docs/local-env.md`・`docs/deployment.md`・`docs/folder-structure.md`・
  `docs/naming-convention.md`・`docs/adr/ADR-009-...md` を実装内容に合わせて更新。
  D6は追補の履歴を消さず「（SS-112で決定19・24に置き換え）」の注記を足すだけに留めた
  （ユーザー承認済みの方針）。
- 修正後 `pytest`（全件）・`ruff check`・`ruff format --check` が green であることを
  確認済み。
