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

- `packages/backend/.env`（`BACKEND_API_PORT` / `DB_PORT` / DB接続情報に加え、`ENV` / `AUTH_MODE` / `AUTH_JWT_SECRET` などの認証系設定。詳細は後述の「認証」節を参照）が生成される。
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

## 認証（`AUTH_MODE` と関連 env）

設計の詳細は [ADR-002](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md) を参照。

- `ENV`: 実行環境（`local` / `test` / `staging` / `production`）。`local` / `test` 以外（`staging` / `production`）では厳格な起動時バリデーションが有効になる（許可リスト方式。新しい `env` 値を追加してもデフォルトで安全側になる）。
- `AUTH_MODE`: `real`（既定・fail-safe）または `dev`。
  - `real`: `POST /auth/session` で Google ID token を検証するモード。
  - `dev`: `real` に加えて `POST /auth/dev-session`（`{"user_key": "..."}` で任意のユーザーを JIT 作成してセッションを発行）が有効になる。ローカル開発・Maestro E2E 専用。
  - `.env.example` は開発者の利便性のため `AUTH_MODE=dev` を既定にしている。**本番デプロイでは絶対に `dev` にしないこと**（`ENV=production` かつ `AUTH_MODE != real` の場合はプロセスが起動しない）。
  - **重要**: `AUTH_MODE=dev` で `docker compose up` していても、`POST /auth/dev-session` は Swagger UI（`/docs`）や `openapi.yaml` には一切現れない（`include_in_schema=False` を指定しているため）。「Swagger UI に出ない」ことは「無効である」ことの証明にはならないので注意する。実際に有効かどうかは `curl` で直接 `POST /auth/dev-session` を叩いて確認すること。
- `AUTH_JWT_SECRET`: 自前 access token(HS256) の署名鍵。`local` / `test` 以外（`staging` / `production`）では 32 文字以上必須。`local` / `test` で未設定の場合はダミー鍵にフォールバックする（起動時に WARNING ログが出る）。
- `AUTH_TOKEN_ISSUER` / `AUTH_TOKEN_AUDIENCE`: 自前 access token の `iss` / `aud` クレーム。既定値（`sanposcape` / `sanposcape-api`）があり、通常は変更不要。
- `AUTH_ACCESS_TOKEN_TTL_SECONDS` / `AUTH_REFRESH_TOKEN_TTL_DAYS`: トークンの有効期限。
- `GOOGLE_ALLOWED_AUDIENCES`: Google ID token の許容 audience（カンマ区切り可）。`local` / `test` 以外では必須。
- `GOOGLE_JWKS_URL`: Google の JWKS エンドポイント。既定値（`https://www.googleapis.com/oauth2/v3/certs`）があり、通常は変更不要。
- `GOOGLE_ALLOWED_ISSUERS`: Google ID token の許容 issuer（カンマ区切り可）。既定値（`https://accounts.google.com`, `accounts.google.com`）があり、通常は変更不要。
- `GOOGLE_JWKS_CACHE_LIFESPAN_SECONDS`: JWKS の `lru_cache` を破棄して再取得するまでの秒数。既定値（3600）があり、通常は変更不要。

**`AUTH_TOKEN_ISSUER` / `AUTH_TOKEN_AUDIENCE` / `GOOGLE_JWKS_URL` / `GOOGLE_ALLOWED_ISSUERS` /
`GOOGLE_JWKS_CACHE_LIFESPAN_SECONDS` は `compose.yaml` の `environment:` には列挙していない**（他の
認証系 env とは扱いが非対称に見えるが意図的）。`config.py` の `Settings` は `env_file=".env"` を
指定しており、`api` コンテナにバインドマウントされた `packages/backend/.env` を直接読む。
`compose.yaml` の `environment:` はホストの env（CI 等、`.env` ファイルを使わない実行環境）から
値を渡すための経路であり、**上記5つは妥当な既定値を持つため意図的に省略している**。既定値を
上書きしたい場合は `.env` に書けば効く（`compose.yaml` への追加は不要）。CI 等で上書きが
必要になった場合は `compose.yaml` の `environment:` にも追加すること。

### 運用上の TODO（SS-10 のスコープ外）

- `AUTH_JWT_SECRET` をローテーションすると、発行済みの access token は全て即時無効になる（refresh token は DB 側で生存しているため、クライアントは 401 → refresh で自動復帰する）。ローテーション手順は別途ドキュメント化する。
- `refresh_tokens` テーブルは失効済み行が蓄積していく。`expires_at` にインデックス済みだが、定期的なクリーンアップ運用（例: 期限切れから30日経過した行の削除）は未実装。
