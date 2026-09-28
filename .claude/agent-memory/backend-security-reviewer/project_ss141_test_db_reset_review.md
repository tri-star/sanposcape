---
name: project-ss141-test-db-reset-review
description: conftest.py's test-DB reset (session-scope schema + per-test DELETE) is safe against prod/staging because test_database_url never reads database_dsn; TEST_DB_NAME==DB_NAME in CI is safe because it's a per-job ephemeral container
metadata:
  type: project
  scope: durable
  adr: packages/backend/docs/adr/ADR-B-001-test-db-isolation-by-table-reset.md
---

`Settings.test_database_url`（`packages/backend/src/sanposcape/config.py`）は常に
`db_user`/`db_password`/`db_host`/`db_port`/`test_db_name` から組み立てられ、
`database_dsn`（本番/staging のシークレット由来 DSN）を一切参照しない。`conftest.py` の
`_setup_test_db_schema`（session開始/終了時の `drop_all`/`create_all`）・`_reset_tables`
（各テスト前の全テーブル `DELETE`、ADR-B-001で導入）はいずれもこの `test_database_url` で
作った `test_engine` にのみ作用する。

CI（`.github/workflows/backend-ci.yml`）は `TEST_DB_NAME` を `DB_NAME` と同値（`app`）にして
いるが、`services: postgres` はジョブ専用の使い捨てコンテナ（ジョブ終了で破棄）であり、
`backend-deploy.yml` からの `workflow_call` も secrets/DB接続情報を渡さない。

**Why:** レビュー依頼で毎回「テスト用DB以外(開発/本番)を誤ってdrop/deleteする経路が無いか」
を確認する必要があるため、その結論（経路は構造的に存在しない）と根拠を再利用できるように
しておく。ADR-B-001 はこの前提（「CIのテスト用DBとマイグレーションのスモークチェック先が
同じDB」等）を「前提として確認した事項」に明記している。

**How to apply:** `conftest.py`/`config.py` の DB 周りが変更される PR をレビューする際は、
まず `test_database_url` が `database_dsn` を参照していないこと（変わっていないか）だけ
確認すれば、本番/staging DB への到達経路の有無はほぼ判定できる。ローカル開発の
`TEST_DB_NAME == DB_NAME` 誤設定（開発DBを毎テスト前に破壊しうる）を止めるバリデーションは
`_validate_environment_settings` に無い（Low、SS-141時点で既存の未解消事項。対応する場合は
`AUTH_MODE`/`MAPS_MODE`等と同じ許可リスト方式のパターンを踏襲する）。SQLi面は
`_delete_all()` が SQLAlchemy Core の `table.delete()`（パラメータ化）とユーザー入力を
含まない `text()` のみを使うため対象外。
