---
name: feedback-ci-test-db-shared-with-alembic
description: backend CI はテスト用 DB を alembic upgrade 後の DB と共有する（ローカルとは違う）。テスト DB の初期化・後始末を変えるプランでは ADR-B-001 の前提と決定を守る
metadata:
  type: feedback
  scope: durable
  adr: packages/backend/docs/adr/ADR-B-001-test-db-isolation-by-table-reset.md
---

`backend-ci.yml` は `TEST_DB_NAME: app`（= `DB_NAME`）にしたうえで `alembic upgrade head` → `pytest` の順に流す。
ローカルは `app_test` を別に作るので、**CI でだけ**テスト開始時に alembic 由来のスキーマがあり、`get_engine()` の
書き込みも同じ DB に入る。

**Why:** これを見落とすと、テストがローカルではモデル定義由来、CI では alembic 由来のスキーマで動き、結果が食い違う。

**How to apply:** テスト DB の初期化・後始末を変えるプランでは、正本の
`packages/backend/docs/adr/ADR-B-001-test-db-isolation-by-table-reset.md` を読み、次を守る:
開始時に `drop_all` → `create_all`（決定1）、消す対象は `Base.metadata.sorted_tables` に限る（決定3）、
「DB を触ったテストだけ後始末する」最適化をするならフックは `Engine` クラス全体に付ける（「計測結果」節の最後）。
