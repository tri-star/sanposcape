---
name: project-ss67-backend-sam-deploy-phase1-2-complete
description: SS-67（backend: AWS SAM でサーバーレスデプロイ基盤を構築）の Phase 1・2 は実装完了。Phase 3以降（実デプロイ）は未着手
metadata:
  type: project
  scope: task-local
  source_issue: SS-67
---

SS-67「backend: AWS SAM で backend のサーバーレスデプロイ基盤を構築する」は
ブランチ `tri-star/SS-67` で Phase 1（アプリ側の受け皿: config/database/secrets/headers）と
Phase 2（Lambda エントリポイント + SAM 資材）を実装完了（2026-09-05）。2コミット。
`docker compose exec api uv run pytest` は386 passed、`ruff check`/`format --check` green、
`alembic upgrade head` green。既存のローカル開発フロー（compose）は無変更で動作継続。

**Why:** FastAPI backend を AWS Lambda（zip + Function URL + CloudFront/OAC）に載せるため。

**How to apply:**
- `database.py` は `get_engine()`/`get_session_factory()`（`lru_cache`）の遅延生成に変更済み。
  module 直下の `engine`/`SessionLocal` は廃止。`Base`/`get_db` は無変更。
- `config.py` に `database_dsn`（Neon pooled、API本体用）と `migrate_database_dsn`
  （Neon unpooled/direct、`aws_lambda/migrate.py` 専用）を追加。後者は
  `_validate_environment_settings` の必須チェック対象外（未投入でも API Lambda は起動できる）。
  Neon の pooled 接続は Schema migrations に使ってはいけない（PgBouncer transaction mode では
  `SET search_path` 等のセッションレベル機能がトランザクションごとにリセットされるため）、
  というのが別 DSN にした理由。
- `core/runtime_config.py` に API用 `hydrate_environment_from_secret()` と
  migrate専用 `hydrate_migration_environment_from_secret()` を分離して実装（理由: 後者を
  API用マッピングに混ぜると、`neon_dsn_unpooled` 未投入の間 API のコールドスタート毎に
  無関係な ERROR ログが出てしまうため）。
- `auth/headers.py`（新規）で `X-App-Authorization` → `Authorization` の優先順に対応済み
  （CloudFront + OAC(SigningBehavior=always) がビューアの `Authorization` を SigV4 署名で
  上書きするため）。ローカル/CI は `Authorization` のままで従来どおり動く。
- `src/sanposcape/aws_lambda/`（新規パッケージ）: `api.py`（Mangum アダプタ）/ `migrate.py`
  （専用 alembic upgrade head Lambda）。`template.yaml`/`samconfig.toml`/`Makefile`/
  `events/*.json` を `packages/backend/` 直下に追加。

**未完了・次回に必要な作業（Phase 3〜6、今回は明示的にスコープ外）:**
- AWS への実デプロイ（`sam deploy`）は AWS クレデンシャルがこの環境に無いため未実施。
- `sam` CLI 自体もこの開発環境に入っておらず、指示によりインストールしなかった。
  次回、`sam` が使える環境で必ず `sam validate --lint` / `sam build --use-container` /
  `sam local invoke` を実行して再確認すること（今回は手動シミュレーションで代替:
  `uv export` + `uv pip install --target` でビルド成果物を再現し、Mangum ハンドラの
  import と health イベントの 200 応答を確認した）。
- シークレットの `neon_dsn_unpooled` はまだ投入されていない（インフラ側と合意の上、
  後続フェーズまでに投入予定）。投入されるまで migrate Lambda は `MigrationConfigError` で
  明示的に失敗する（設計どおりの挙動）。
- `docs/deployment.md`（新規）・ADR（Lambda + Function URL + CloudFront 構成の決定記録）・
  フォローアップチケット起票（mobile の CloudFront 対応 / in-process キャッシュの外部ストア
  移行 / SAM デプロイの CI 化）は未着手。
