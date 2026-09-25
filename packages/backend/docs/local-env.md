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

現時点では投入するデータが無い（`spots` サンプルは SS-88 で削除した。地図・ピンは
ユーザーに紐づくため、認証済みユーザーが居ない状態でシードする意味のあるデータが無い）。

## 動作確認

```bash
# コンテナ状態
docker compose ps

# ヘルスチェック（<BACKEND_API_PORT> は .env の値）
curl http://localhost:<BACKEND_API_PORT>/health   # -> {"status":"ok"}

# API ドキュメント（ブラウザ、Scalar。SS-131）
# http://localhost:<BACKEND_API_PORT>/docs
# `/redoc` は廃止済み（404）。`ENV=production` では `/docs` 自体が存在しない（404）。
# OpenAPI の JSON は環境に関係なく `/openapi.json` で取得できる。

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

## テストと `.env` の関係（SS-100）

- **テストコードは手元の `.env` / OS 環境変数から独立している。** `src/sanposcape/conftest.py` の
  `_isolate_settings_from_ambient_env`（autouse）が、各テストの実行前に `Settings` の全フィールド名に
  対応する環境変数を削除し、カレントディレクトリを空の一時ディレクトリへ退避する。これにより
  `Settings(...)` をテストコード内で明示構築するとき、**渡さなかったフィールドは常にコード上の
  デフォルト値になる**（`.env` を生成済みかどうか、`.env` に何を書いたかに関わらず結果が変わらない）。
- この隔離が無いと何が起きるか: `.env.example`（→ `scripts/initialize-dotenv.sh` が生成する `.env`）は
  ローカル開発の利便性のため `FEATURE_FLAG_MODE=stub` を配っている。さらに `compose.yaml` はこの値を
  `api` コンテナの **OS 環境変数** としても渡す。隔離が無ければ、`Settings(env="test")` のように一部の
  フィールドだけを明示したテストは `.env` を生成した開発者の手元でだけ `feature_flag_mode` が
  `stub` になり、コード既定の `real`（`APPCONFIG_*` 未設定時の挙動など）を前提にしたテストが
  CI とローカルとで食い違う結果になっていた（CI には `.env` が無いため気付けなかった）。
- **例外: テスト用DBの接続情報（`test_database_url`）はこの隔離の対象外。** `conftest.py` は
  モジュール import 時（＝どのテストのフィクスチャよりも前）に `get_settings()` を呼んで
  `test_engine` を組み立てるため、実際の `.env` / OS 環境変数（`DB_HOST` 等）から解決される。
  `.env` を一律に無効化すると DB に繋がらなくなって全テストが落ちるため、意図的にここだけ対象外にしている。
- 新しいテストで `Settings(...)` を構築するときも、この隔離の恩恵は自動的に効く。個別のテストで
  `feature_flag_mode="real"` のような値を渡し回る対症療法は避け、テストが期待する挙動を検証したい
  フィールドだけを明示すれば、それ以外は常にコード上のデフォルトになることを前提にしてよい。

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
  - **重要**: `AUTH_MODE=dev` で `docker compose up` していても、`POST /auth/dev-session` は API ドキュメント（`/docs` の Scalar。SS-131 で Swagger UI から置き換え）や `openapi.yaml` には一切現れない（`include_in_schema=False` を指定しているため）。「`/docs` に出ない」ことは「無効である」ことの証明にはならないので注意する。実際に有効かどうかは `curl` で直接 `POST /auth/dev-session` を叩いて確認すること。
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
    - **（SS-33）`/explore/routes/loop` も対応する**: 往路は既存の直線ルートを再利用し、復路は `目的地 → 経由点 → 現在地` を直線で結んだ決定的な周回を返す（`return_is_same_path: false`）。経由点は `maps/loop_route.py`（実 provider と共通）が生成するため、fake でも周回の判定ロジック自体は本物と同じものを通る。
  - `docker compose restart` では反映されない。`MAPS_MODE=fake docker compose up -d` のように `up -d` でコンテナを作り直すこと（`compose.yaml` の `${...}` はコンテナ生成時に展開されるため）。
- `GOOGLE_MAPS_SERVER_API_KEY`: Places API (New) と Routes API のみを許可した**server-side 用** API key。`staging` / `production` では必須であり、mobile の `EXPO_PUBLIC_*`、OpenAPI、ソースコードへは決して入れない。
- `GOOGLE_MAPS_CACHE_TTL_SECONDS` / `GOOGLE_MAPS_CACHE_MAX_ENTRIES`: 正規化済みの成功応答だけを保持するプロセス内キャッシュの TTL と上限（いずれも正の値）。座標・カテゴリ・経路は provider 内でキャッシュされ、key や Google の生レスポンスを API に返さない。
- `GOOGLE_MAPS_SEARCH_DEADLINE_SECONDS`: `/explore/places` の Places 検索から徒歩経路による候補絞り込みまでの合計時間上限。期限までに評価できなかった候補は返さない。Nearby Search の上限に合わせ、1探索で評価する候補・Routes 呼び出しは最大20件である。
- `GOOGLE_MAPS_RATE_LIMIT_REQUESTS` / `GOOGLE_MAPS_RATE_LIMIT_WINDOW_SECONDS`: 認証済みの `/explore` リクエストに、ユーザーと接続元IPの両方へ適用する process-local の上限（既定 30 リクエスト/60 秒）。
- `GOOGLE_MAPS_ANONYMOUS_RATE_LIMIT_REQUESTS`: アクセストークンを伴わない `/explore` リクエストに、接続元IPだけへ適用する上限（既定 10 リクエスト/60 秒）。無効・期限切れのトークンは匿名として扱わず 401 を返す。トークンは `X-App-Authorization` → `Authorization` の優先順で読む（`src/sanposcape/auth/headers.py`）。mobile は SS-70 以降 `X-App-Authorization` のみを送るため、`Authorization` の有無だけで匿名判定をしているわけではない点に注意。
- cache miss は同じ正規化 key ごとに single-flight 化され、同時の同一 Places/Routes 呼び出しを1件へまとめる。
- これらは**単一インスタンス限定**の緩和策である。水平スケールを開始する前に、Redis 等の共有 limiter と edge/proxy の request-size / IP rate-limit を必ず導入すること。共有 limiter は運用・識別子方針の別設計が必要なため、このタスクでは導入しない。
- `GOOGLE_MAPS_CONNECT_TIMEOUT_SECONDS` / `GOOGLE_MAPS_READ_TIMEOUT_SECONDS`: 上流への接続／読取 timeout（既定 3 秒／8 秒）。超過時は API に 503 を返す。**`/explore/routes/loop`（周回）はこの限りではない**: 片方の候補だけがタイムアウトしても、もう片方が成功していれば 200 を返す（同じ道フォールバックの単発取得のみ、この timeout がそのまま 503 に直結する）。周回のログの読み方は下記「`/explore/places` が 503 を返すときの切り分け」の直後を参照。
- `GOOGLE_MAPS_MAX_PLACE_CANDIDATES` / `GOOGLE_MAPS_MAX_ROUTE_REQUESTS_PER_SEARCH`: 1 回の探索で取得・経路計算する候補数の上限（いずれも既定・最大 20）。Google Places Nearby Search の provider 上限と、上流のコスト・レート対策に合わせた安全弁である。
- Places / Routes の endpoint は Google の HTTPS API に固定しており、server API key の送信先を環境変数で変更することはできない。テストは HTTP client の差し替えで行う。

### 周回ルート（`/explore/routes/loop`、SS-33。ADR-007 参照）

- `GOOGLE_MAPS_LOOP_ROUTE_ENABLED`: 既定 `true`。`false` にすると周回の生成自体を行わず、常に往路を1回取得して**同じ道で戻る**（`return_is_same_path: true`）応答になる（real / fake のどちらでも有効）。用途は品質劣化時の緊急停止と、mobile 側で同じ道フォールバック表示を手動確認したいときの強制切り替え。
  - `MAPS_MODE=fake docker compose up -d` と同様、`docker compose restart` では反映されない。値を変えたら `GOOGLE_MAPS_LOOP_ROUTE_ENABLED=false docker compose up -d` のように `up -d` でコンテナを作り直すこと。
- `GOOGLE_MAPS_ROUTE_DEADLINE_SECONDS`: 既定 12 秒（上限 25 秒）。**周回1リクエスト全体**（並列2候補＋両候補失敗時の同じ道フォールバックの単発取得まで含む）の時間予算であり、1候補あたりの上限ではない。各候補は `min(GOOGLE_MAPS_READ_TIMEOUT_SECONDS, GOOGLE_MAPS_ROUTE_DEADLINE_SECONDS)` で打ち切り、単発フォールバックは残り予算（deadline − 経過時間）が無ければ 503 になる。Lambda の Function URL タイムアウト（29秒、[ADR-005](../../../docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md)）より十分短くしている。
- 周回が作れない（O-D が近すぎる／候補がすべて判定で不合格）場合もエラーにはせず、200 + `return_is_same_path: true` で返す（往路 leg を逆順にしたものを復路として使う）。
- 検証・しきい値調整用のスクリプト `scripts/loop_route_probe.py`（`scripts/loop_route_probe_cases.yaml` の O/D の組を使う）がある。`MAPS_MODE=real` かつ `GOOGLE_MAPS_SERVER_API_KEY` 設定時のみ動作し、`docker compose exec api uv run python scripts/loop_route_probe.py` で実行する。候補ごとの指標・合否・採用結果を標準出力に、往路/復路/経由点を `tmp-probe/<timestamp>.geojson`（`.gitignore` 済み）に出す。詳細は ADR-007 を参照。
  - スクリプトの結果を見て `maps/loop_route.py` のしきい値・係数を変えたら、E2E の生命線（fake の全候補で周回が合格すること。ADR-007 決定8）を `docker compose exec api uv run pytest src/sanposcape/integrations/google_maps/tests/test_fake.py::test_fake_loop_is_accepted_for_every_fake_candidate` で必ず再確認すること。
  - スクリプト実行のために `.env`（`MAPS_MODE` / `GOOGLE_MAPS_SERVER_API_KEY`）を変えた後は、`restart` ではなく `docker compose up -d` でコンテナを作り直すこと。

## フィーチャーフラグ（`FEATURE_FLAG_MODE` と関連 env、AWS AppConfig, SS-98/ADR-008）

設計の詳細は [ADR-008](../../../docs/adr/ADR-008-deploy-release-separation.md) の
「追補: `/app-config` のレスポンススキーマとフラグ取得基盤」を参照。運用手順は
[deployment.md](./deployment.md) §11。

- `FEATURE_FLAG_MODE`: `real`（既定・fail-safe） | `stub`。`ENV=local` / `test` 限定で、
  それ以外（`staging` / `production`）で `stub` を指定すると `AUTH_MODE` / `MAPS_MODE` と
  同じ許可リスト方式の検証で起動に失敗する。
  - `real`: AWS AppConfig（boto3 `appconfigdata`）を実際に呼ぶ。`APPCONFIG_*` を1本でも
    未設定にすると `UnconfiguredFlagSource`（AWS を一切呼ばない安全な既定。`/app-config` は
    全フラグ `false` を返す）にフォールバックする。**ローカルではこれで十分動く**が、
    起動時に `APPCONFIG_* is not configured; all feature flags are OFF.` の WARNING ログが
    出る（`ENV=local` / `test` では WARNING、`staging` / `production` では設定漏れの
    検知性を保つため ERROR になる）。
  - `stub`: ネットワークを一切使わず `FEATURE_FLAG_STUB_DOCUMENT` を返す。`.env.example` は
    開発者の利便性のためこちらを既定にしている。
  - **`stub` の判定は `APPCONFIG_*` の有無より優先される**（`MAPS_MODE=fake` が
    `GOOGLE_MAPS_SERVER_API_KEY` の有無より優先されるのと同じ設計）。
- `FEATURE_FLAG_STUB_DOCUMENT`: `stub` モードで返す文書。`GetLatestConfiguration` が返す
  簡略 JSON と同じ形の文字列（本番と同じパーサ（`integrations/aws/appconfig.py`）を通すため）。
  不正な JSON や JSON オブジェクトでない値を渡しても起動は落ちず、WARNING ログ + 空の
  ドキュメント（= 登録簿の全フラグ `false`）にフォールバックする。
- `APPCONFIG_APPLICATION_ID` / `APPCONFIG_ENVIRONMENT_ID` / `APPCONFIG_CONFIGURATION_PROFILE_ID`:
  ローカルでは通常未設定でよい。`real` で dev の AppConfig への実疎通を試したい場合のみ、
  3本とも dev の ID に設定する（1本でも空だと `UnconfiguredFlagSource` になる）。
- `APPCONFIG_POLL_INTERVAL_SECONDS` / `APPCONFIG_ERROR_BACKOFF_SECONDS` /
  `APPCONFIG_CONNECT_TIMEOUT_SECONDS` / `APPCONFIG_READ_TIMEOUT_SECONDS`: 妥当な既定値が
  あり、通常は変更不要。
- 動作確認: `curl http://localhost:<BACKEND_API_PORT>/app-config`。`config_source` が
  `stub` / `default` / `appconfig` のどれになっているかで、どの経路が選ばれているか診断できる
  （`unconfigured` のような別値にはならない点に注意。未設定・取得失敗はいずれも `default`）。
- `MAPS_MODE` と同様、`docker compose restart` では反映されない。`.env` の値を変えたら
  `docker compose up -d` でコンテナを作り直すこと。

## 写真ストレージ（`STORAGE_MODE` と関連 env、SS-88/ADR-009）

設計の詳細は [ADR-009](../../../docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md)
を参照。

- `STORAGE_MODE`: `real`（既定・fail-safe） | `fake`。`ENV=local` / `test` 限定で、
  それ以外（`staging` / `production`）で `fake` を指定すると `AUTH_MODE` 等と同じ
  許可リスト方式の検証で起動に失敗する。`.env.example` は開発者の利便性のため
  `fake` を既定にしている。
  - `real`: S3 に実際に接続する。`PIN_PHOTO_BUCKET_NAME` が空なら
    `UnconfiguredObjectStorage` にフォールバックする。写真の**書き込み系**（
    `POST /pin-photo-uploads`・`POST /pins`・`POST /pins/{pin_id}/photos` の確定処理）は
    503 になるが、**閲覧系**（`GET /pins`・`GET /pins/{pin_id}`・`GET /pins/{pin_id}/photos`）
    と `GET /sanpo-maps` は影響を受けず、200 のまま `thumbnail`/`original_url` が
    null になる（ADR-009 決定18）。**編集**（`PATCH /pins/{pin_id}`）は S3 を操作しない
    ので影響を受けず、DB を更新して 200 を返す（写真 URL は null）。**削除系**
    （`DELETE /pins/{pin_id}`・`DELETE /pins/{pin_id}/photos/{photo_id}`）も 503 には
    ならず、DB を削除したあと S3 の後始末を `ObjectStorageUnavailableError` の WARNING を
    出してスキップし、204 を返す（ADR-009 決定22, SS-112）。平常のローカル開発では
    バケットを設定しないので、`STORAGE_MODE=real` のままだと写真は試せない
    （`deployment.md` §12「写真ストレージ」/ ADR-009 決定8 参照）。
    **（SS-88 追補）** 直送まわりの不具合は fake では再現しないことがあるため、
    ローカルの backend を dev の実バケットに向ける手順を
    [local-development.md](./local-development.md) の「実 S3 に繋いで確認する」に用意した。
    `PIN_PHOTO_BUCKET_NAME` / `PIN_PHOTO_BUCKET_REGION` と AWS の一時認証情報を渡すと
    `STORAGE_MODE=real` でも写真を試せる。
  - `fake`: ネットワークを一切使わない開発用の実装。`POST /pin-photo-uploads` が返す
    `upload.url` は backend 自身の `/dev-storage/uploads`（S3 の presigned POST 互換。
    成功 204・サイズ超過や署名不正は S3 と同じ XML エラー）を指し、写真の presigned GET
    も `/dev-storage/objects/{key}` を指す。**`/dev-storage/*` は `STORAGE_MODE=fake` の
    ときだけ `include_in_schema=False` で include され、OpenAPI には一切現れない。**
    実機・エミュレータからもリクエストされたホストで URL を組み立てるため、
    LAN 越し・Android エミュレータ（`10.0.2.2`）でも届く。
- `DEV_STORAGE_DIR`: `STORAGE_MODE=fake` の保存先（既定は `compose.yaml` / `.env.example` の
  `storages/dev-storage`。`packages/backend` からの相対パス）。`objects/<key>` に本体、
  `content-types/<key>` に Content-Type を書くので、backend を再起動しても写真が残る。
  中身は `.gitignore` 対象（ディレクトリは `.gitkeep` で残す）で、容量による追い出しはしない。
  溜まった写真を消したいときは `.gitkeep` 以外を手で削除する（DB のピンと食い違って表示が
  404 になるので、DB も作り直すときに合わせて消すのがよい）。空にするとプロセス内メモリになり、
  再起動（`--reload` 含む）で消える。
- `PIN_PHOTO_MAX_BYTES` / `PIN_PHOTO_USER_QUOTA_BYTES`: 1枚あたりの上限（既定 10 MiB）と
  ユーザー合計の上限（既定 1 GiB）。他の上限値（保有枠数・TTL・サムネイルサイズ・確定処理の
  時間予算/並列度など）は妥当な既定値があり、通常は変更不要（`config.py` の `Settings` 参照）。
- `MAPS_MODE` と同様、`docker compose restart` では反映されない。`.env` の値を変えたら
  `docker compose up -d` でコンテナを作り直すこと。

### `STORAGE_MODE=fake` での写真付きピン登録の試し方

```bash
# 1) 枠を発行する
curl -s -X POST localhost:<BACKEND_API_PORT>/pin-photo-uploads \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"content_type":"image/jpeg","byte_size":<実ファイルのバイト数>}'

# 2) 応答の upload.fields を -F で並べ、最後に -F file=@<写真.jpg> を付けて upload.url へ POST → 204
curl -s -o /dev/null -w '%{http_code}\n' -X POST <upload.url> \
  -F key=<fields.key> -F Content-Type=image/jpeg \
  -F x-fake-max-bytes=<fields.x-fake-max-bytes> -F x-fake-expires=<fields.x-fake-expires> \
  -F x-fake-signature=<fields.x-fake-signature> -F file=@photo.jpg

# 3) POST /pins（sanpo_map_id 省略、photo_upload_ids に upload_id を含める）→ 201
#    photos[0].thumbnail.url を curl / ブラウザで開くと長辺512pxのJPEGが返る
```

`AUTH_MODE=dev` の `POST /auth/dev-session`（`{"user_key":"..."}`）でトークンを取得できる。

## リクエストサイズ制限

`RequestSizeLimitMiddleware`（`core/middleware.py`）が JSON 解析前に本文サイズを拒否する ASGI ミドルウェアで、path prefix ごとに別々の上限を掛けられるよう汎用化されている（SS-18 で `/explore` 専用から拡張）。`main.py` の `create_app()` で prefix ごとに `app.add_middleware()` を複数回呼び出しており、現在は以下の3系統が有効。

- `GOOGLE_MAPS_EXPLORE_REQUEST_MAX_BYTES`: `/explore` 配下の本文サイズ上限（既定 32,768 / 上限 1,048,576）。
- `WALKS_REQUEST_MAX_BYTES`: `/walks` 配下の本文サイズ上限（既定 1,048,576 / 上限 4,194,304）。軌跡（`track`）を含むため `/explore` より大きい上限にしているが、無制限にはしていない（低コスト DoS 対策）。
- `PINS_REQUEST_MAX_BYTES`: `/pins`・`/pins/{pin_id}/photos`・`/pin-photo-uploads` 配下の本文サイズ上限（既定 16,384 / 上限 65,536）。写真本体は presigned POST で直接 S3 へ送るため、これらのエンドポイントの JSON 本文はメタデータのみで小さい（SS-88）。

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

### `/explore/routes/loop` のログと応答の対応（SS-33。ADR-007 参照）

周回は候補（右/左）ごとの結果と、採用結果を1行ずつ `Loop route candidate ...` / `Loop route result: outcome=...` として INFO/WARNING で出す（`docker compose logs -f api | grep "Loop route"`）。`outcome` と応答の対応は次のとおり。

| `outcome` | 意味 | 応答 |
| --- | --- | --- |
| `accepted` | いずれかの候補が合格し、その周回を採用 | 200、`return_is_same_path: false` |
| `fallback_same_path_from_candidate` | 候補は取得できたが全て不合格 | 200、`return_is_same_path: true`（成功した候補の往路を逆順にして復路にする） |
| `fallback_same_path_single_fetch` | 両候補とも `GoogleMapsUnavailableError`（タイムアウト等）で、残り時間内に往路を単発取得できた | 200、`return_is_same_path: true` |
| `quota` | いずれかの候補が `GoogleMapsQuotaError`（他方も失敗） | 429 |
| `deadline_expired` | 両候補失敗後、`GOOGLE_MAPS_ROUTE_DEADLINE_SECONDS` の残り時間が無い | 503 |

候補ごとの失敗（`Loop route candidate quota exceeded: side=...` / `Loop route candidate unavailable: side=...`）は、もう片方の候補が成功して最終的に 200 になった場合でも必ず1行出る。

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
- `GOOGLE_MAPS_ROUTE_DEADLINE_SECONDS`
- `WALKS_REQUEST_MAX_BYTES`
- `PINS_REQUEST_MAX_BYTES`
- `APPCONFIG_APPLICATION_ID` / `APPCONFIG_ENVIRONMENT_ID` / `APPCONFIG_CONFIGURATION_PROFILE_ID`
- `APPCONFIG_POLL_INTERVAL_SECONDS` / `APPCONFIG_ERROR_BACKOFF_SECONDS`
- `APPCONFIG_CONNECT_TIMEOUT_SECONDS` / `APPCONFIG_READ_TIMEOUT_SECONDS`
- `PIN_PHOTO_MAX_PIXELS` / `PIN_PHOTO_MAX_PENDING_UPLOADS` / `PIN_PHOTO_UPLOAD_URL_TTL_SECONDS` /
  `PIN_PHOTO_UPLOAD_ATTACH_TTL_SECONDS` / `PIN_PHOTO_DOWNLOAD_URL_TTL_SECONDS` /
  `PIN_PHOTO_THUMBNAIL_MAX_EDGE_PX` / `PIN_PHOTO_THUMBNAIL_JPEG_QUALITY` /
  `PIN_PHOTO_CONFIRM_DEADLINE_SECONDS` / `PIN_PHOTO_CONFIRM_CONCURRENCY` /
  `PIN_PHOTO_DELETE_DEADLINE_SECONDS`（SS-112: ピン・写真削除時の S3 実体削除の時間予算。
  上限20秒。締め切りと削除用の connect + read の和が 25 秒を超えると起動に失敗する） /
  `OBJECT_STORAGE_CONNECT_TIMEOUT_SECONDS` / `OBJECT_STORAGE_READ_TIMEOUT_SECONDS` /
  `OBJECT_STORAGE_DELETE_CONNECT_TIMEOUT_SECONDS` / `OBJECT_STORAGE_DELETE_READ_TIMEOUT_SECONDS`
  （PR #101 レビュー対応: 削除専用の client の timeout。削除は再試行しない）

（`GOOGLE_MAPS_LOOP_ROUTE_ENABLED` は `MAPS_MODE` と同様に開発中の切り替えに使うため、
`compose.yaml` の `environment:` に含めている。`FEATURE_FLAG_MODE` も `AUTH_MODE` /
`MAPS_MODE` と同じ「開発中に切り替えるモード系」として `compose.yaml` の `environment:` に
含めている。**`STORAGE_MODE`（と `DEV_STORAGE_DIR`）も同じ理由で含めている。`FEATURE_FLAG_STUB_DOCUMENT` /
`PIN_PHOTO_MAX_BYTES` / `PIN_PHOTO_USER_QUOTA_BYTES` は SS-88 で `compose.yaml` の
`environment:` に追加した**（mobile が `mobile-e2e.yml` から `.env.example` の値をそのまま
使えるようにするため。以前は「妥当な既定値を持つため省略」としていたが、E2E で
`pin_registration` を確実に ON にする・写真の上限値を CI から上書きできるようにする目的で
明示列挙に変更した）。

**（SS-88 追補）`LOG_LEVEL`・`PIN_PHOTO_BUCKET_NAME`・`PIN_PHOTO_BUCKET_REGION`・
`AWS_REGION`・`AWS_ACCESS_KEY_ID`・`AWS_SECRET_ACCESS_KEY`・`AWS_SESSION_TOKEN` も
`compose.yaml` の `environment:` に追加した。** 前3者は
[local-development.md](./local-development.md) の「実 S3 に繋いで確認する」で使う
（既定は空 = 従来どおり `UnconfiguredObjectStorage`）。AWS の認証情報は
**`.env` に書かず**、`aws configure export-credentials` の出力をシェルで `eval` してから
`docker compose` を起動する運用にしている（一時認証情報は短命で、`.env` に書くと必ず古くなるため）。
`AWS_REGION` だけは既定値 `ap-southeast-1` を持つ。

既定値を上書きしたい場合は `.env` に書けば効く（`compose.yaml` への追加は不要）。CI 等で上書きが
必要になった場合は `compose.yaml` の `environment:` にも追加すること（このリストは追加のたびに
更新すること）。

### 運用上の TODO（SS-10 のスコープ外）

- `AUTH_JWT_SECRET` をローテーションすると、発行済みの access token は全て即時無効になる（refresh token は DB 側で生存しているため、クライアントは 401 → refresh で自動復帰する）。ローテーション手順は別途ドキュメント化する。
- `refresh_tokens` テーブルは失効済み行が蓄積していく。`expires_at` にインデックス済みだが、定期的なクリーンアップ運用（例: 期限切れから30日経過した行の削除）は未実装。
