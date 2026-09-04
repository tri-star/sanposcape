# フォルダ構造ガイドライン (backend)

FastAPI + SQLAlchemy + Alembic + Pydantic による backend のフォルダ構造の方針をまとめる。
ツール・ライブラリの詳細は [ツール・ライブラリ](./toolsets-libraries.md) を、命名規則は [命名規則](./naming-convention.md) を参照。

## 前提・設計方針

- **src レイアウト** を採用し、アプリ本体は `src/sanposcape/` 配下に置く。
- **ドメイン単位の凝集 × レイヤー分離** をベースにする。
  - ドメイン（`users` / `walks` / `spots` / `maps` など）ごとにフォルダを分け、その中で層を分ける。
  - レイヤーは **router → service → repository** の3層。
    - `router`: HTTPの入出力の受け渡しのみ。**薄く保つ**（バリデーションと依存解決、serviceの呼び出し）。
    - `service`: ビジネスロジック。トランザクション境界・ユースケースを持つ。
    - `repository`: DBアクセス（SQLAlchemyクエリ）を隔離する。
- **外部API（Google Maps Platform）は `integrations/` に隔離**し、ドメインの service から利用する。コスト/レート対策のキャッシュもここに閉じ込め、クライアントから直接叩かない。
- **テストはテスト対象の近くに `tests/` サブフォルダで併置（co-location）** する（詳細は後述）。

## 全体構造

```
packages/backend/
├── compose.yaml               # api / db コンテナ定義
├── Dockerfile
├── pyproject.toml             # uv 依存管理・ruff 設定・pytest 設定
├── uv.lock
├── alembic.ini
├── .env / .env.example        # ポート・DB接続・プロジェクト名など
│
├── src/
│   └── sanposcape/            # アプリ本体パッケージ
│       ├── __init__.py
│       ├── main.py            # FastAPI app 生成・router 登録・例外ハンドラ配線
│       ├── config.py          # pydantic-settings で環境変数を型安全に読む
│       ├── database.py        # get_engine() / get_session_factory()（遅延生成・lru_cache）/ Base / get_db
│       ├── dependencies.py    # 横断的な依存（DBセッション, 認証済みユーザー取得 等）
│       ├── all_models.py      # 全ドメインの models を import して Base.metadata に集約（Alembic autogenerate 用）
│       ├── conftest.py        # テスト共通フィクスチャ（DB, TestClient 等）
│       │
│       ├── aws_lambda/        # AWS Lambda 固有の受け皿（ECS 移植性の境界。SS-67）
│       │   ├── api.py         #   Mangum アダプタ。main.app の import 前にシークレットをハイドレーションする
│       │   ├── migrate.py     #   Alembic upgrade head を実行する専用 Lambda ハンドラ
│       │   └── tests/         #   このモジュールのテスト（併置）
│       │
│       ├── core/              # 横断的関心事（ドメインに属さない土台）
│       │   ├── pagination.py  #   keyset（cursor）ページネーションの汎用ユーティリティ
│       │   ├── geo.py         #   ドメイン横断で使う共有スキーマ（GeoPoint 等）
│       │   ├── middleware.py  #   ASGI ミドルウェア（RequestSizeLimitMiddleware 等）
│       │   ├── runtime_config.py #   シークレット JSON → 環境変数のハイドレーション（SS-67）
│       │   └── tests/         #   このモジュールのテスト（併置）
│       │
│       ├── integrations/      # 外部API連携（隔離層）
│       │   ├── google_maps/   #   Places / Routes クライアント + キャッシュ
│       │   └── aws/           #   Secrets Manager 取得（boto3）+ プロセス内キャッシュ（SS-67）
│       │
│       ├── auth/              # ドメイン: 認証・セッション（Google ID token検証・自前トークン）
│       │   ├── __init__.py
│       │   ├── router.py      #   APIRouter（/auth/session, /auth/refresh, /auth/logout, /auth/me）
│       │   ├── dev_router.py  #   AUTH_MODE=dev 限定の /auth/dev-session（include_in_schema=False）
│       │   ├── schemas.py     #   Pydantic（リクエスト/レスポンス）
│       │   ├── models.py      #   SQLAlchemy モデル（RefreshToken）
│       │   ├── service.py     #   ビジネスロジック（AuthService）
│       │   ├── repository.py  #   DBアクセス（RefreshTokenRepository）
│       │   ├── dependencies.py#   ドメイン固有の依存（get_auth_service 等）
│       │   ├── exceptions.py  #   ドメイン固有の例外
│       │   ├── headers.py     #   X-App-Authorization → Authorization の順で Bearer を読む（SS-67）
│       │   ├── tokens.py      #   自前 access token(HS256) の発行・検証、refresh token の生成/ハッシュ化
│       │   ├── providers/     #   IdP ごとの ID token 検証実装（google.py 等）を隔離する層
│       │   └── tests/         #   このドメインのテスト（併置）
│       │
│       ├── users/             # ドメイン: ユーザー・アカウント
│       │   ├── __init__.py
│       │   ├── router.py      #   APIRouter（エンドポイント定義のみ、薄く）
│       │   ├── schemas.py     #   Pydantic（リクエスト/レスポンス）
│       │   ├── models.py      #   SQLAlchemy モデル
│       │   ├── service.py     #   ビジネスロジック
│       │   ├── repository.py  #   DBアクセス（クエリ）
│       │   ├── dependencies.py#   ドメイン固有の依存
│       │   ├── exceptions.py  #   ドメイン固有の例外
│       │   └── tests/         #   このドメインのテスト（併置）
│       │       ├── test_service.py
│       │       └── test_router.py
│       │
│       ├── walks/             # ドメイン: 終了済み散歩の記録・履歴（散歩開始の探索・経路提示は maps/ の責務）
│       ├── spots/             # ドメイン: スポット候補（Google Maps由来）
│       └── maps/              # ドメイン: 往復範囲探索・ルート算出の proxy エンドポイント
│
├── alembic/
│   ├── env.py                 # all_models.py の Base を参照してメタデータを集約
│   └── versions/              # マイグレーションスクリプト
│
├── scripts/
│   └── seed.py                # Seeder（初期データ投入）
│
└── docs/                      # 設計ドキュメント
```

## 各ディレクトリの役割と配置ルール

### `src/sanposcape/` 直下（アプリの土台）
- `main.py`: FastAPI アプリの生成と各ドメイン router の登録、例外ハンドラの配線のみ。ロジックは書かない。
- `config.py`: `pydantic-settings` で `.env` を型安全に読む。設定値はここ経由で参照する。
- `database.py`: `get_engine()` / `get_session_factory()`（ともに `lru_cache` で遅延生成・1プロセス1回）と、宣言的 `Base` / `get_db` を定義。
  module の import 時点では `create_engine` を呼ばない（Lambda では起動時にシークレットを
  環境変数へハイドレーションしてから `Settings` を確定させる必要があり、import 順に依存すると
  ハイドレーション前の設定で接続してしまうため）。`Base` / `get_db` の名前と挙動は変えていないため、
  呼び出し側（`models.py` / `dependencies.py` / 各 `tests/`）は無変更で動く。
- `dependencies.py`: 複数ドメインで使う依存（DBセッションの供給、認証済みユーザーの取得など）。

### `core/` — 横断的関心事
- どのドメインにも属さない土台。ページングなどの汎用処理に加え、`geo.py` の `GeoPoint` のようなドメイン横断で使う**共有スキーマ**、`middleware.py` の `RequestSizeLimitMiddleware` のような**ASGI ミドルウェア**もここに置く。「特定のドメインに閉じない」ものを置く場所であり、対象はユーティリティ関数に限らない。
- ドメインを import しない（依存の向きは `domain → core`）。
- 認証（Google ID token 検証・自前セッショントークン）は `core/` ではなく `auth/` ドメインに実装している。「認証専用の入出力・ロジック・状態（`refresh_tokens` テーブル等）を持つ」という点で他ドメインと同じ形をしており、`core/` の「どのドメインにも属さない」という性質に当てはまらないため。詳細は [ADR-002](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md) を参照。

### `integrations/` — 外部API連携（隔離層）
- Google Maps Platform（Places / Routes）などの外部クライアントとキャッシュをここに閉じ込める。
- ドメインの `service` からのみ呼び出す。router から直接呼ばない。
- 差し替え・モックしやすいよう、インターフェースを介して公開する。
- `integrations/aws/`: AWS SDK（boto3）連携を隔離する層。`secrets.py` が Secrets Manager から
  シークレット JSON を取得し `lru_cache` でプロセス内キャッシュする。boto3 は Lambda の
  python3.12 管理ランタイムに同梱されているため zip には含めず、`[dependency-groups] dev` に
  のみ追加している（ユニットテスト・型解決用）。シークレットの値は絶対にログへ出さない。

### `aws_lambda/` — AWS Lambda 固有の受け皿（ECS 移植性の境界）
- Lambda 固有のコードは**このパッケージにのみ**置く。ECS へ移す際はこのパッケージを使わないだけで済むようにする制約（grep で機械的に検査できる）。
- `api.py`: Mangum アダプタ。`core/runtime_config.py` のハイドレーションを `sanposcape.main` の
  import より**前**に実行してから `app` を import する（順序が意味を持つ 1 ファイルの責務）。
- `migrate.py`: Alembic `upgrade head` を実行する専用 Lambda（API 本体のハンドラでは走らせない）。
- `main.py` の `create_app()` / `app` はこのパッケージから独立しており無変更のまま。ECS では
  従来どおり `uvicorn sanposcape.main:app` で動く。

### `<domain>/` — ドメイン単位の凝集
- 1つのドメインに属する `router / schemas / models / service / repository / dependencies / exceptions` をまとめる。
- **層をまたぐ呼び出しは一方向**にする: `router → service → repository`。逆流させない。
- 他ドメインから使う必要が出たものは `core/` へ昇格させる（ドメイン間の直接依存を増やさない）。
  - 昇格時は、**旧 import 位置に再エクスポートを残して段階移行する**（OpenAPI のコンポーネント名を変えないため）。
    実例: `GeoPoint` は `maps/schemas.py` から `core/geo.py` へ昇格したが、`maps/schemas.py` は
    `from sanposcape.core.geo import GeoPoint` を再エクスポートし続けている。クラス名を変えていない
    ため、生成される OpenAPI のコンポーネント名（`GeoPoint`）にも変化はない。

### レイヤーの配置判断
> - HTTPの入出力・依存解決だけ → `router.py`
> - ユースケース／ビジネスルール → `service.py`
> - DBクエリ → `repository.py`
> - 外部API呼び出し → `integrations/`（service から利用）
>
> 迷ったらまず `service.py` に書き、DBアクセスが増えたら `repository.py` に切り出す。

### 現在時刻の扱い（クロック注入）
- **現在時刻に依存する service は、`now: Callable[[], datetime] = lambda: datetime.now(UTC)` を
  コンストラクタ引数で注入可能にする**。採用済み: `auth/service.py` の `AuthService`（トークンの有効期限）、
  `walks/service.py` の `WalkService`（集計の「今日」判定）。
- service 内に `datetime.now()` を直接書かない。テストから時刻を固定できず、日付境界の検証が書けなくなる
  （書けたとしても実行日に依存する不安定なテストになる）。
- `dependencies.py` の `get_xxx_service()` は既定値のまま生成し、注入はテストからのみ行う。
- 日付計算そのものは DB / Pydantic に依存しない純粋関数モジュールへ切り出す（実例: `walks/stats.py`）。
  こうすると DB を立てずに境界条件のテストが書ける。

### `models.py` の配置と Alembic
- SQLAlchemy モデルは**各ドメインの `models.py` に併置**する。
- 集約モジュール `all_models.py` が全ドメインの models を import して `Base.metadata` に載せ、`alembic/env.py` はこの `all_models.py` の `Base` を参照する。
- **新しいドメインの models を追加したら、`all_models.py` に import を足すこと**（追加しないと Alembic の autogenerate がそのモデルを認識できず、マイグレーションが生成されない）。

## テストファイルの配置（co-location）

- テストは**テスト対象と同じドメインの `tests/` サブフォルダ**に置き、ファイル名は `test_*.py`。
  - 例: `src/sanposcape/walks/tests/test_service.py`
- 併置に伴う同名テストファイル（複数ドメインの `test_service.py` 等）の衝突を避けるため、
  **pytest の import-mode を `importlib` にする**（`pyproject.toml` の `[tool.pytest.ini_options]` で設定）。
  ```toml
  [tool.pytest.ini_options]
  addopts = "--import-mode=importlib"
  testpaths = ["src"]
  python_files = ["test_*.py"]
  ```
- 共通フィクスチャ（テスト用DB・FastAPI `TestClient` 等）は `src/sanposcape/conftest.py` に集約する。
- テスト用DBは本番/開発用DBと分離する（`TEST_DB_NAME`）。

## コマンド実行

- `alembic` / `ruff` / `pytest` は**必ず Docker コンテナ内で実行**する（詳細は [ローカル開発ガイド](./local-development.md)）。
