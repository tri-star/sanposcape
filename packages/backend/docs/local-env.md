# backend ローカル環境構築手順

FastAPI + PostgreSQL を Docker Compose（`api` / `db` コンテナ）で立ち上げる。
設計方針は [local-env-design](./local-env-design.md)、コマンド実行の注意は [local-development](./local-development.md) を参照。

## 前提

- Docker / Docker Compose が利用可能であること
- `packages/backend/.env` が生成済みであること（未生成なら下記）

## セットアップ手順

### 1. `.env` の生成（初回のみ）

プロジェクトルートで空きポートを検出して `.env` を生成する。

```bash
# <project-root> で実行
bash scripts/initialize-dotenv.sh
```

- `packages/backend/.env`（`BACKEND_API_PORT` / `DB_PORT` / DB接続情報）が生成される。
- Git worktree など複数環境でもポートが衝突しないよう、実行のたびに空きポートを割り当てる。
- `APP_UID` / `APP_GID` は既定で `1000:1000` となり、Docker build 時に非rootの `app_user` へ設定される。

### 2. コンテナのビルド・起動

```bash
cd packages/backend
docker compose up -d --build
```

- `db` が healthy になってから `api` が起動する。
- `api` は healthcheck に `/health` を使用する。
- `api` と `docker compose exec api ...` は `app_user` として実行される。

### WSL2 の UID/GID を合わせる

bind mount したソースへ migration、format、OpenAPI 出力などを書き込む場合は、ホストとコンテナの数値 UID/GID を一致させる。単発で指定する場合は次のように起動する。

```bash
cd packages/backend
APP_UID="$(id -u)" APP_GID="$(id -g)" docker compose up -d --build
```

継続利用する場合は `packages/backend/.env` の `APP_UID` / `APP_GID` を `id -u` / `id -g` の結果へ変更する。これらは build args のため、値を変えた後は必ず `--build` を付けてイメージを再作成する。

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

# 非root実行の確認（既定値では 1000:1000 / app_user）
docker compose exec api id
docker compose exec api sh -c 'grep -E "^Uid:" /proc/1/status'
```

`docker compose logs api` で Uvicorn の stdout/stderr を確認できる。ファイルログ用の volume は作成しない。

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

## `.venv` volume の移行と UID/GID 変更

- `.venv` は `venv-app-user` named volume に保存する。従来の `venv` volume は参照しないため、root 所有の旧 volume による権限エラーは引き継がれない。
- `APP_UID` / `APP_GID` を後から変更した場合、停止後に対象 Compose project の `venv-app-user` volume だけを再作成してから `docker compose up -d --build` を実行する。`docker compose down -v` は DB の `db-data` も削除するため、この用途では使用しない。

```bash
docker compose down
docker volume ls --filter label=com.docker.compose.project --format '{{.Name}}' | grep '_venv-app-user$'
# 表示された <project>_venv-app-user だけを確認して削除する
docker volume rm <project>_venv-app-user
docker compose up -d --build
```

## OpenAPI 定義

- `scripts/export_openapi.py` が `packages/backend/openapi.yaml`（および `openapi.json`）を出力する。
- `openapi.yaml` は API 契約として commit し、mobile の Orval がこれを参照してクライアント・MSW モックを生成する。
- **API を変更したら `export_openapi.py` を再実行して `openapi.yaml` を更新する**こと。

## データベース

- 開発用DB（`DB_NAME`）とテスト用DB（`TEST_DB_NAME`）を分離している。
- テスト用DBは `db` コンテナ初回起動時に `scripts/init-test-db.sh` で作成される。
