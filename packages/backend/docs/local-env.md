# backend ローカル環境構築手順

FastAPI + PostgreSQL を Docker Compose（`api` / `db` コンテナ）で立ち上げる。
設計方針は [local-env-design](./local-env-design.md)、コマンド実行の注意は [local-development](./local-development.md) を参照。

## 前提

- Docker / Docker Compose が利用可能であること
- プロジェクトルートに `.env` が生成済みであること（未生成なら下記）

## セットアップ手順

### 1. `.env` の生成（初回のみ）

プロジェクトルートで空きポートを検出して `.env` を生成する。

```bash
# <project-root> で実行
bash scripts/initialize-dotenv.sh
```

- `packages/backend/.env`（`BACKEND_API_PORT` / `DB_PORT` / DB接続情報）が生成される。
- Git worktree など複数環境でもポートが衝突しないよう、実行のたびに空きポートを割り当てる。

### 2. コンテナのビルド・起動

```bash
cd packages/backend
docker compose up -d --build
```

- `db` が healthy になってから `api` が起動する。
- `api` は healthcheck に `/health` を使用する。

### 3. マイグレーション適用

```bash
docker compose exec api uv run alembic upgrade head
```

### 4. 初期データ投入（seed, 任意）

```bash
docker compose exec api uv run python scripts/seed.py
```

## 動作確認

```bash
# コンテナ状態
docker compose ps

# ヘルスチェック（<BACKEND_API_PORT> は .env の値）
curl http://localhost:<BACKEND_API_PORT>/health   # -> {"status":"ok"}

# API ドキュメント（ブラウザ）
# http://localhost:<BACKEND_API_PORT>/docs
```

## よく使うコマンド

すべて**コンテナ内**で実行する（ホストから直接 `uv run` しない）。

```bash
# マイグレーション生成
docker compose exec api uv run alembic revision --autogenerate -m "<message>"

# テスト（テスト用DB TEST_DB_NAME を使用）
docker compose exec api uv run pytest

# Lint / Format
docker compose exec api uv run ruff check
docker compose exec api uv run ruff format

# OpenAPI 定義の出力（mobile の Orval が消費する openapi.yaml を更新）
docker compose exec api uv run python scripts/export_openapi.py
```

## OpenAPI 定義

- `scripts/export_openapi.py` が `packages/backend/openapi.yaml`（および `openapi.json`）を出力する。
- `openapi.yaml` は API 契約として commit し、mobile の Orval がこれを参照してクライアント・MSW モックを生成する。
- **API を変更したら `export_openapi.py` を再実行して `openapi.yaml` を更新する**こと。

## データベース

- 開発用DB（`DB_NAME`）とテスト用DB（`TEST_DB_NAME`）を分離している。
- テスト用DBは `db` コンテナ初回起動時に `scripts/init-test-db.sh` で作成される。
