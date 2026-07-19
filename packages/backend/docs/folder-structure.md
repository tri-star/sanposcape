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
│       ├── database.py        # engine / SessionLocal / Base
│       ├── dependencies.py    # 横断的な依存（DBセッション, 認証済みユーザー取得 等）
│       ├── exceptions.py      # 共通例外・APIエラー表現・ハンドラ
│       ├── conftest.py        # テスト共通フィクスチャ（DB, TestClient 等）
│       │
│       ├── core/              # 横断的関心事（ドメインに属さない土台）
│       │   ├── security/      #   Auth0/authlib: JWT検証・スコープ・現在ユーザー
│       │   └── ...            #   ページング等の汎用ユーティリティ
│       │
│       ├── integrations/      # 外部API連携（隔離層）
│       │   └── google_maps/   #   Places / Routes クライアント + キャッシュ
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
│       ├── walks/             # ドメイン: 散歩開始・散歩ルート・履歴
│       ├── spots/             # ドメイン: スポット候補（Google Maps由来）
│       └── maps/              # ドメイン: 往復範囲探索・ルート算出の proxy エンドポイント
│
├── alembic/
│   ├── env.py                 # 全モデルを import してメタデータを集約
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
- `database.py`: `engine` / `SessionLocal` / 宣言的 `Base` を定義。
- `dependencies.py`: 複数ドメインで使う依存（DBセッションの供給、認証済みユーザーの取得など）。

### `core/` — 横断的関心事
- どのドメインにも属さない土台。認証（Auth0/authlib のJWT検証）、ページングなどの汎用処理。
- ドメインを import しない（依存の向きは `domain → core`）。

### `integrations/` — 外部API連携（隔離層）
- Google Maps Platform（Places / Routes）などの外部クライアントとキャッシュをここに閉じ込める。
- ドメインの `service` からのみ呼び出す。router から直接呼ばない。
- 差し替え・モックしやすいよう、インターフェースを介して公開する。

### `<domain>/` — ドメイン単位の凝集
- 1つのドメインに属する `router / schemas / models / service / repository / dependencies / exceptions` をまとめる。
- **層をまたぐ呼び出しは一方向**にする: `router → service → repository`。逆流させない。
- 他ドメインから使う必要が出たものは `core/` へ昇格させる（ドメイン間の直接依存を増やさない）。

### レイヤーの配置判断
> - HTTPの入出力・依存解決だけ → `router.py`
> - ユースケース／ビジネスルール → `service.py`
> - DBクエリ → `repository.py`
> - 外部API呼び出し → `integrations/`（service から利用）
>
> 迷ったらまず `service.py` に書き、DBアクセスが増えたら `repository.py` に切り出す。

### `models.py` の配置と Alembic
- SQLAlchemy モデルは**各ドメインの `models.py` に併置**する。
- Alembic の autogenerate が全モデルを認識できるよう、`alembic/env.py`（または集約モジュール）で**全ドメインの models を import** して `Base.metadata` に載せる。

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
