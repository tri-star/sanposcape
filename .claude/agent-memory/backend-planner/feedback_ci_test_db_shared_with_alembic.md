---
name: feedback-ci-test-db-shared-with-alembic
description: backend CI はテスト用 DB（TEST_DB_NAME=app）を DB_NAME と共有し、テストの前に alembic upgrade head を流す。テスト DB の初期化方式を変えるとき、テストが alembic 由来のスキーマで動くかモデル定義由来で動くかが変わる
metadata:
  type: feedback
  scope: durable
---

`.github/workflows/backend-ci.yml` は `TEST_DB_NAME: app`（= `DB_NAME`）にしたうえで、`uv run alembic upgrade head` → `uv run pytest` の順に実行する（SS-141 のプラン作成時に確認）。
- そのため CI では、テストが始まる時点でテスト用 DB に alembic が作ったテーブルと `alembic_version` がある。
- ローカルは `app_test` を別に作っているので、この状況にならない。**CI でだけ差が出る**。
- さらに CI では `get_engine()`（`database_url`）もテスト用 DB と同じ DB を指す。`get_db` を差し替えていない app 経由の書き込みも同じ DB に入る。

**Why:** conftest のスキーマ作成を `create_all`（checkfirst）だけにすると、CI では alembic 由来のスキーマのままテスト全体が動く。一方ローカルではモデル定義由来のスキーマで動くので、ローカルと CI の結果が食い違いうる。

**How to apply:** テスト DB の初期化・後始末を変えるプランでは、次の 3 点を守る。
- session の開始時に `drop_all` → `create_all` を実行する。
- 消す対象は `Base.metadata` のテーブルに限る（`alembic_version` を含めない）。
- 「DB を触ったテストだけ後始末する」ような最適化をする場合は、フックを `test_engine` 単体ではなく `Engine` クラス全体に付ける（`get_engine()` 経由の書き込みを見逃さないため）。
