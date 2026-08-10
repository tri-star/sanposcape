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

- `packages/backend/.env`（`BACKEND_API_PORT` / `DB_PORT` / DB接続情報に加え、`ENV` / `AUTH_MODE` / `AUTH_JWT_SECRET` などの認証系設定。詳細は後述の「認証」節を参照）が生成される。
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

## Google Maps Platform（探索・徒歩経路）

- `MAPS_MODE`: `real`（既定・fail-safe） | `fake`。`ENV=local` / `test` 限定で、それ以外（`staging` / `production`）で `fake` を指定すると `AUTH_MODE` と同じ許可リスト方式の検証で起動に失敗する。
  - `real`: `GOOGLE_MAPS_SERVER_API_KEY` の有無に応じて `HttpGoogleMapsProvider`（キー有）/ `UnconfiguredGoogleMapsProvider`（キー無・`/explore/*` は 503）を使う。
  - `fake`: `FakeGoogleMapsProvider`（`integrations/google_maps/fake.py`）を使う。Places / Routes への外部リクエストを一切行わないため課金は発生しない。origin から北東方向へ等間隔に並ぶ決定的な候補を返す。用途は Maestro E2E（`/explore/places` が常に候補を返す必要がある）と、Google Maps API キーを持たない開発者のローカル動作確認。
    - **`fake` の判定は `GOOGLE_MAPS_SERVER_API_KEY` の有無より優先される**。キーを設定していても `MAPS_MODE=fake` なら実 API は呼ばれない（E2E で意図せず課金が走らないようにするための安全側の設計）。実 API の疎通を確認したいときは `MAPS_MODE` を外すこと。
    - 候補は既定で 5 件（リクエストの `limit` が 5 未満ならその件数）。`category` はリクエストの `categories` を先頭から循環割り当てし、`name` は category に対応する「テストコンビニ1」のような固定名 + 連番になる。
    - 起動時に `MAPS_MODE=fake: using FakeGoogleMapsProvider` の WARNING をログに出すので、`docker compose logs api | grep MAPS_MODE` でどちらの provider で動いているか確認できる。
  - `docker compose restart` では反映されない。`MAPS_MODE=fake docker compose up -d` のように `up -d` でコンテナを作り直すこと（`compose.yaml` の `${...}` はコンテナ生成時に展開されるため）。
- `GOOGLE_MAPS_SERVER_API_KEY`: Places API (New) と Routes API のみを許可した**server-side 用** API key。`staging` / `production` では必須であり、mobile の `EXPO_PUBLIC_*`、OpenAPI、ソースコードへは決して入れない。
- `GOOGLE_MAPS_CACHE_TTL_SECONDS` / `GOOGLE_MAPS_CACHE_MAX_ENTRIES`: 正規化済みの成功応答だけを保持するプロセス内キャッシュの TTL と上限（いずれも正の値）。座標・カテゴリ・経路は provider 内でキャッシュされ、key や Google の生レスポンスを API に返さない。
- `GOOGLE_MAPS_SEARCH_DEADLINE_SECONDS`: `/explore/places` の Places 検索から徒歩経路による候補絞り込みまでの合計時間上限。期限までに評価できなかった候補は返さない。Nearby Search の上限に合わせ、1探索で評価する候補・Routes 呼び出しは最大20件である。
- `GOOGLE_MAPS_RATE_LIMIT_REQUESTS` / `GOOGLE_MAPS_RATE_LIMIT_WINDOW_SECONDS`: 認証済みユーザーと接続元IPの両方に適用する process-local の `/explore` リクエスト上限。
- cache miss は同じ正規化 key ごとに single-flight 化され、同時の同一 Places/Routes 呼び出しを1件へまとめる。
- これらは**単一インスタンス限定**の緩和策である。水平スケールを開始する前に、Redis 等の共有 limiter と edge/proxy の request-size / IP rate-limit を必ず導入すること。共有 limiter は運用・識別子方針の別設計が必要なため、このタスクでは導入しない。
- `GOOGLE_MAPS_CONNECT_TIMEOUT_SECONDS` / `GOOGLE_MAPS_READ_TIMEOUT_SECONDS`: 上流への接続／読取 timeout（既定 3 秒／8 秒）。超過時は API に 503 を返す。
- `GOOGLE_MAPS_MAX_PLACE_CANDIDATES` / `GOOGLE_MAPS_MAX_ROUTE_REQUESTS_PER_SEARCH`: 1 回の探索で取得・経路計算する候補数の上限（いずれも既定・最大 20）。Google Places Nearby Search の provider 上限と、上流のコスト・レート対策に合わせた安全弁である。
- Places / Routes の endpoint は Google の HTTPS API に固定しており、server API key の送信先を環境変数で変更することはできない。テストは HTTP client の差し替えで行う。

## リクエストサイズ制限

`RequestSizeLimitMiddleware`（`core/middleware.py`）が JSON 解析前に本文サイズを拒否する ASGI ミドルウェアで、path prefix ごとに別々の上限を掛けられるよう汎用化されている（SS-18 で `/explore` 専用から拡張）。`main.py` の `create_app()` で prefix ごとに `app.add_middleware()` を複数回呼び出しており、現在は以下の2系統が有効。

- `GOOGLE_MAPS_EXPLORE_REQUEST_MAX_BYTES`: `/explore` 配下の本文サイズ上限（既定 32,768 / 上限 1,048,576）。
- `WALKS_REQUEST_MAX_BYTES`: `/walks` 配下の本文サイズ上限（既定 1,048,576 / 上限 4,194,304）。軌跡（`track`）を含むため `/explore` より大きい上限にしているが、無制限にはしていない（低コスト DoS 対策）。

超過時はいずれも 413 を返す。

### `/explore/places` が 503 を返すときの切り分け

外部の詳細をクライアントへ漏らさないため、上流の失敗は理由を問わず **429（quota）か 503** に丸められる。**503 は「Google が落ちている」を意味しない**ので、原因はサーバーログで確認する。

```bash
docker compose logs -f api | grep "Google Maps"
```

| ログ | 原因 | 対処 |
| --- | --- | --- |
| 何も出ない（かつ即座に 503） | `GOOGLE_MAPS_SERVER_API_KEY` が未設定。`UnconfiguredGoogleMapsProvider` が選ばれ、外部リクエスト自体が発生していない | `.env` にキーを設定して `docker compose up -d`。**`restart` では反映されない**（`compose.yaml` の `${...}` はコンテナ生成時に展開されるため） |
| 候補は返るが名前が「テスト◯◯」・座標が origin の北東に等間隔 | `MAPS_MODE=fake` で起動している（`docker compose logs api \| grep MAPS_MODE` で WARNING を確認） | Maestro E2E / キー未所持のローカル開発ではこれが意図した挙動。実 API の疎通確認をしたい場合は `MAPS_MODE` を外して `docker compose up -d` し直す |
| `HTTP 403 status=PERMISSION_DENIED reasons=API_KEY_ANDROID_APP_BLOCKED` | mobile 用の **Android アプリ制限付きキー**を backend に設定している。サーバーからのリクエストにはパッケージ名・SHA-1 が無いため拒否される | アプリケーションの制限が「なし」または「IPアドレス」の**サーバー用キーを別途作成**する。mobile 側の `GOOGLE_MAPS_ANDROID_SDK_KEY` とは必ず別キーにする（[ADR-001](../../../docs/adr/ADR-001-map-poi-google-maps-platform.md)） |
| `reasons=SERVICE_DISABLED` | Places API (New) / Routes API が有効化されていない | Google Cloud Console で両APIを有効化する |
| `reasons=API_KEY_SERVICE_BLOCKED` | キーのAPI制限で Places/Routes が許可されていない | キーのAPI制限に両APIを追加する |
| `status=PERMISSION_DENIED` で請求関連の message | 請求先アカウント未設定（両APIとも課金必須） | プロジェクトに請求先アカウントを紐づける |
| `request timed out` / `ConnectError` | コンテナから外部 HTTPS に到達できない | ネットワーク・プロキシ設定を確認する |

キーが正しいかは、コンテナ内から直接 Google を叩くのが早い。

```bash
docker compose exec api python -c "
import os, httpx
r = httpx.post('https://places.googleapis.com/v1/places:searchNearby',
  json={'includedTypes':['park'],'maxResultCount':1,'locationRestriction':{'circle':{'center':{'latitude':35.681236,'longitude':139.767125},'radius':500}}},
  headers={'X-Goog-Api-Key':os.environ['GOOGLE_MAPS_SERVER_API_KEY'],'X-Goog-FieldMask':'places.id'}, timeout=15)
print(r.status_code); print(r.text[:800])"
```
- server key は Google Cloud Console で API 制限（Places API (New)、Routes API）と環境別の制限を設定する。地図タイルに使う mobile SDK key は別の key として SS-15 で管理する。

**既定値を持つ以下の env は `compose.yaml` の `environment:` には列挙していない**（他の env とは
扱いが非対称に見えるが意図的）。`config.py` の `Settings` は `env_file=".env"` を指定しており、
`api` コンテナにバインドマウントされた `packages/backend/.env` を直接読む。`compose.yaml` の
`environment:` はホストの env（CI 等、`.env` ファイルを使わない実行環境）から値を渡すための経路
であり、以下は妥当な既定値を持つため意図的に省略している。

- `AUTH_TOKEN_ISSUER` / `AUTH_TOKEN_AUDIENCE`
- `GOOGLE_JWKS_URL` / `GOOGLE_ALLOWED_ISSUERS` / `GOOGLE_JWKS_CACHE_LIFESPAN_SECONDS`
- `GOOGLE_MAPS_CONNECT_TIMEOUT_SECONDS` / `GOOGLE_MAPS_READ_TIMEOUT_SECONDS`
- `GOOGLE_MAPS_MAX_PLACE_CANDIDATES` / `GOOGLE_MAPS_MAX_ROUTE_REQUESTS_PER_SEARCH`
- `WALKS_REQUEST_MAX_BYTES`

既定値を上書きしたい場合は `.env` に書けば効く（`compose.yaml` への追加は不要）。CI 等で上書きが
必要になった場合は `compose.yaml` の `environment:` にも追加すること（このリストは追加のたびに
更新すること）。

### 運用上の TODO（SS-10 のスコープ外）

- `AUTH_JWT_SECRET` をローテーションすると、発行済みの access token は全て即時無効になる（refresh token は DB 側で生存しているため、クライアントは 401 → refresh で自動復帰する）。ローテーション手順は別途ドキュメント化する。
- `refresh_tokens` テーブルは失効済み行が蓄積していく。`expires_at` にインデックス済みだが、定期的なクリーンアップ運用（例: 期限切れから30日経過した行の削除）は未実装。
