# フォルダ構造ガイドライン (backend)

FastAPI + SQLAlchemy + Alembic + Pydantic による backend のフォルダ構造の方針をまとめる。
ツール・ライブラリの詳細は [ツール・ライブラリ](./toolsets-libraries.md) を、命名規則は [命名規則](./naming-convention.md) を参照。

この文書は大まかな構造と配置のルールだけを持つ。個々のファイルの役割はコード（docstring・コメント）を、設計の経緯は ADR を正とする。

## 前提・設計方針

- **src レイアウト** を採用し、アプリ本体は `src/sanposcape/` 配下に置く。
- **ドメイン単位の凝集 × レイヤー分離** をベースにする。
  - ドメイン（`users` / `walks` / `sanpo_maps` / `maps` など）ごとにフォルダを分け、その中で層を分ける。
  - レイヤーは **router → service → repository** の3層。
    - `router`: HTTPの入出力の受け渡しのみ。**薄く保つ**（バリデーションと依存解決、serviceの呼び出し）。
    - `service`: ビジネスロジック。トランザクション境界・ユースケースを持つ。
    - `repository`: DBアクセス（SQLAlchemyクエリ）を隔離する。
- **外部API（Google Maps Platform・Sign in with Apple・AWS SDK）は `integrations/` に隔離**し、ドメインの service から利用する。コスト/レート対策のキャッシュもここに閉じ込める。
- **テストはテスト対象の近くに `tests/` サブフォルダで併置（co-location）** する（詳細は後述）。

## 全体構造

```
packages/backend/
├── compose.yaml               # ローカルのコンテナ定義（api / db など）
├── Dockerfile
├── pyproject.toml             # uv 依存管理・ruff 設定・pytest 設定
├── alembic.ini
├── template.yaml              # AWS SAM テンプレート（デプロイは deployment.md）
├── samconfig.toml / Makefile  # SAM の環境設定とビルドターゲット
├── events/                    # `sam local invoke` 等の payload
├── feature-flags.json         # フィーチャーフラグの定義と既定値
│
├── src/
│   └── sanposcape/            # アプリ本体パッケージ
│       ├── main.py            # FastAPI app 生成・router 登録・例外ハンドラ配線
│       ├── config.py          # 環境変数の読み取り（pydantic-settings）
│       ├── database.py        # エンジン・セッション・Base
│       ├── dependencies.py    # 横断的な依存（DBセッション, 認証済みユーザー取得 等）
│       ├── all_models.py      # 全ドメインの models の集約（Alembic autogenerate 用）
│       ├── conftest.py        # テスト共通フィクスチャ
│       ├── tests/             # ドメインに属さない横断テスト（併置の例外）
│       │
│       ├── aws_lambda/        # AWS Lambda 固有の受け皿（ハンドラ・マイグレーション・定期処理）
│       ├── core/              # 横断的関心事（ドメインに属さない土台）
│       ├── integrations/      # 外部API連携（google_maps/ ・ apple/ ・ aws/）
│       │
│       ├── auth/              # ドメイン: 認証・セッション
│       ├── users/             # ドメイン: ユーザー・アカウント
│       ├── walks/             # ドメイン: 終了済み散歩の記録・履歴
│       ├── maps/              # ドメイン: 往復範囲探索・ルート算出
│       ├── sanpo_maps/        # ドメイン: 地図・ピン・写真（maps/ ・ pins/ ・ photos/ のサブパッケージ）
│       ├── app_config/        # ドメイン: mobile / LP 向け公開設定
│       ├── health/            # ドメイン: 疎通確認
│       └── api_docs/          # ドメイン: API ドキュメント UI（本番では include しない）
│
├── alembic/
│   ├── env.py                 # all_models.py の Base を参照してメタデータを集約
│   └── versions/              # マイグレーションスクリプト
│
├── scripts/                   # 起動・seed・openapi.yaml の再生成・開発者向けの検証スクリプト、
│                              # 一回限りの作業のスクリプト（サブディレクトリに README を添え、作業が終われば消す）
└── docs/                      # 設計ドキュメント（ADR は docs/adr/）
```

ドメインのフォルダの中は、おおむね次の形になる（使わないファイルは置かない。例: `health/` は `router.py` のみ）。

```
<domain>/
├── router.py        # APIRouter（薄く）
├── schemas.py       # Pydantic（リクエスト/レスポンス）
├── models.py        # SQLAlchemy モデル
├── service.py       # ビジネスロジック
├── repository.py    # DBアクセス
├── dependencies.py  # ドメイン固有の依存（get_xxx_service 等）
├── exceptions.py    # ドメイン固有の例外
└── tests/           # このドメインのテスト（併置）
```

## 各ディレクトリの役割と配置ルール

### `src/sanposcape/` 直下（アプリの土台）
- `main.py`: FastAPI アプリの生成と各ドメイン router の登録、例外ハンドラの配線のみ。ロジックは書かない。
- `config.py`: `pydantic-settings` で `.env` を型安全に読む。設定値はここ経由で参照する。
- `database.py`: エンジンとセッションファクトリは遅延生成する（import 時に `create_engine` を呼ばない。
  Lambda ではシークレットを環境変数へ移してから設定を確定させるため）。
- `dependencies.py`: 複数ドメインで使う依存（DBセッションの供給、認証済みユーザーの取得など）。

### `core/` — 横断的関心事
- どのドメインにも属さない土台。汎用処理（ページングなど）に加え、ドメイン横断の共有スキーマ（`GeoPoint` 等）、
  ASGI ミドルウェア、可観測性（ログ・トレース）、フィーチャーフラグの評価層も置く。対象はユーティリティ関数に限らない。
- ドメインを import しない（依存の向きは `domain → core`）。
- 認証は `core/` ではなく `auth/` ドメインに置く（専用の入出力・ロジック・テーブルを持ち、他ドメインと同じ形のため。
  [ADR-002](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md)）。

### `integrations/` — 外部API連携（隔離層）
- 外部クライアントとキャッシュをここに閉じ込める。AppConfig は取得層（`integrations/aws/`）と
  評価層（`core/feature_flags.py`）に分けている（ADR-008 追補 D3）。
- ドメインの `service`（またはその補助モジュール）からのみ呼び出す。router から直接呼ばない。
- 差し替え・モックしやすいよう、インターフェース（Protocol など）を介して公開する。
- シークレット・トークンの値をログ・例外メッセージ・スパンに出さない（[ADR-013](../../../docs/adr/ADR-013-observability-adot-application-signals.md)）。

### `aws_lambda/` — AWS Lambda 固有の受け皿（ECS 移植性の境界）
- Lambda 固有のコードは**このパッケージにのみ**置く。ECS へ移す際はこのパッケージを使わないだけで済むようにする
  （`main.py` の `create_app()` / `app` はこのパッケージに依存しない）。
- `asgi_handler.py` は FastAPI の lifespan を Lambda の init で1回だけ起動する。**shutdown は走らず、lifespan の
  state も使えない**ため、共有する資源は `app.state` に置く
  （[ADR-005 SS-183 追補](../../../docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md)）。
- API 以外の Lambda（マイグレーション・定期処理）は `create_app()` を通らないので、シークレットの取り込みと
  ログの設定を自分で行う。

### `<domain>/` — ドメイン単位の凝集
- 1つのドメインに属する `router / schemas / models / service / repository / dependencies / exceptions` をまとめる。
- **層をまたぐ呼び出しは一方向**にする: `router → service → repository`。逆流させない。
- 他ドメインから使う必要が出たものは `core/` へ昇格させる（ドメイン間の直接依存を増やさない）。
- ただし、片方のドメインがもう片方に**構造的に依存する**関係（例: `auth → users`）は例外として
  一方向の直接依存を許容する。
  - 昇格時は、**旧 import 位置に再エクスポートを残して段階移行する**（OpenAPI のコンポーネント名を変えないため）。

### 複数エンティティを持つドメイン（`sanpo_maps/`）

複数のエンティティが権限・ライフサイクル・トランザクションを共有し、別ドメインに分けると双方向の依存が要る場合は、
1つのドメインの中をサブパッケージに分ける。`sanpo_maps`（地図・ピン・写真）がこの形の実例。規則（M1〜M9）と経緯の正本は
[ADR-011](../../../docs/adr/ADR-011-sanpo-maps-module-structure.md)。

- ドメイン直下は**共有カーネル**だけにする（全モデルの `models.py`、`exceptions.py`、権限判定などの純粋関数、
  複数サブパッケージが使う小さな共通部品）。`router`/`service`/`repository` はサブパッケージ（`maps/`・`pins/`・`photos/`）に置く。
- 依存の向き: `pins → maps → photos`、`pins → photos`、すべて → 共有カーネル。下位は上位を import しない。
  双方向の依存が必要になったら、port（Protocol）で回避せずユースケース層を導入する。
  `sanpo_maps/tests/test_architecture.py` が AST で検査している。
- `sanpo_maps/maps/` はアプリ直下の `maps/` と同名になるため、ドキュメント・コメント・agent-memory では
  **必ずモジュール名から書く**（`sanpo_maps/maps/service.py` と書き、単に `maps/service.py` と書かない）。
- 新しいエンティティ群が独自の `router` とテーブルを持ち、既存サブパッケージとの依存が一方向（上の並びのどこかに追加できる形）に
  収まるなら、サブパッケージとして追加してよい。追加したら、`test_architecture.py` の許可表と ADR-011 を追補として更新する。

### レイヤーの配置判断
> - HTTPの入出力・依存解決だけ → `router.py`
> - ユースケース／ビジネスルール → `service.py`
> - DBクエリ → `repository.py`
> - 外部API呼び出し → `integrations/`（service から利用）
>
> 迷ったらまず `service.py` に書き、DBアクセスが増えたら `repository.py` に切り出す。

### 例外と冪等な INSERT
- router に `try/except` を書かない。ドメイン例外は各ドメインの `exceptions.py` に定義し、`main.py` の `register_exception_handlers()` で HTTP 応答に変換する。
- 一意制約による冪等な INSERT は、`with self._db.begin_nested():` の中で `add()`＋`flush()` し、`IntegrityError` を捕まえて既存行を取り直す（`users/repository.py`・`walks/repository.py`）。素の `rollback()` は呼び出し元の外側のトランザクションまで壊すので使わない。

### 現在時刻の扱い（クロック注入）
- **現在時刻に依存する service・部品は、`now: Callable[[], datetime] = lambda: datetime.now(UTC)` を
  コンストラクタ引数で注入可能にする**。経過時間だけが必要な部品（時間予算の締め切り判定など）は
  `monotonic: Callable[[], float] = time.monotonic` を同じ発想で注入する。
- service 内に `datetime.now()` を直接書かない。テストから時刻を固定できず、日付境界の検証が書けなくなる。
- `dependencies.py` の `get_xxx_service()` は既定値のまま生成し、注入はテストからのみ行う。
- 日付計算そのものは DB / Pydantic に依存しない純粋関数モジュールへ切り出す（実例: `walks/stats.py`）。
  同じ方針は DB・HTTP を持たない計算全般に当てはまる（実例: `maps/geometry.py`・`maps/loop_route.py`）。

### `models.py` の配置と Alembic
- SQLAlchemy モデルは**各ドメインの `models.py` に併置**する（`sanpo_maps/` はドメイン直下の `models.py` 1ファイルに全モデルを置く。ADR-011）。
- 集約モジュール `all_models.py` が全ドメインの models を import して `Base.metadata` に載せ、`alembic/env.py` はこの `all_models.py` の `Base` を参照する。
- **新しいドメインの models を追加したら、`all_models.py` に import を足すこと**（追加しないと Alembic の autogenerate がそのモデルを認識できず、マイグレーションが生成されない）。

## テストファイルの配置（co-location）

- テストは**テスト対象と同じドメインの `tests/` サブフォルダ**に置き、ファイル名は `test_*.py`。
  - 例: `src/sanposcape/walks/tests/test_service.py`
- 同名テストファイルの衝突を避けるため、pytest の import-mode を `importlib` にしている（`pyproject.toml`）。
- 共通フィクスチャ（テスト用DB・FastAPI `TestClient` 等）は `src/sanposcape/conftest.py` に集約する。
- `create_app()` の app を `TestClient` で包むとき、対象のルートが lifespan で設定される `app.state.*` を使うなら `with TestClient(app) as client:` にする。`with` を省くときは理由をコメントに書く。
- テスト用DBは本番/開発用DBと分離する（`TEST_DB_NAME`）。スキーマは session スコープで1回だけ作り、
  各テストの前にテーブルの中身を DELETE で空にする。詳細とトラブルシューティングは
  [ADR-B-001](./adr/ADR-B-001-test-db-isolation-by-table-reset.md)。
  - 約束事: テスト中に DDL（`CREATE`/`ALTER`/`DROP`/`TRUNCATE`等）を実行しない。
  - 約束事: session/module スコープの fixture で DB にデータを入れない（入れても各テストの前に消える）。
  - 約束事: PostGIS 等の拡張を追加するとき、または migration で投入するマスタデータに
    依存するモデルを追加するときは、`_delete_all` の対象（`Base.metadata.sorted_tables`）と
    seed/拡張由来データの扱いを見直す。

## コマンド実行

- `alembic` / `ruff` / `pytest` は**必ず Docker コンテナ内で実行**する（詳細は [ローカル開発ガイド](./local-development.md)）。
