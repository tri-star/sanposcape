---
name: project_ss141_test_db_reset_review
description: テスト用DBの分離方式（session スコープでスキーマ作成＋各テスト前にDELETE）はADR-B-001が正本。変更レビュー時に壊してはいけない2点。
metadata:
  type: project
  scope: durable
  adr: packages/backend/docs/adr/ADR-B-001-test-db-isolation-by-table-reset.md
---

`packages/backend/src/sanposcape/conftest.py` のテスト用DB分離方式（DELETE 採用の計測結果、
TRUNCATE・外側トランザクション+savepoint 案を採らない理由、pytest-xdist をスコープ外にした理由）は
`packages/backend/docs/adr/ADR-B-001-test-db-isolation-by-table-reset.md` に記録されている。

**How to apply:** `conftest.py` の fixture 順序や後始末方式、`all_models.py` へのモデル追加に
関わる変更をレビューするときは、次の2点が意図的な設計であることを前提に確認する。
- `_setup_test_db_schema`（session）が `_reset_tables`（function）より先に実行されること。
- テーブルはテストの**前**に空にする（後ではない。teardown 失敗が次のテストへ連鎖しないため）。

`all_models.py` へのモデル追加漏れは、スキーマ作成だけでなく `_delete_all` の対象からも漏れる点にも
注意する。pytest-xdist 導入をレビューする際は、ワーカーごとのDB分離とこの DELETE 方式の組み合わせを確認する。
