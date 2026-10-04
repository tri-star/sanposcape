# フォルダ構造ガイドライン (backend)

FastAPI + SQLAlchemy + Alembic + Pydantic による backend のフォルダ構造の方針をまとめる。
ツール・ライブラリの詳細は [ツール・ライブラリ](./toolsets-libraries.md) を、命名規則は [命名規則](./naming-convention.md) を参照。

## 前提・設計方針

- **src レイアウト** を採用し、アプリ本体は `src/sanposcape/` 配下に置く。
- **ドメイン単位の凝集 × レイヤー分離** をベースにする。
  - ドメイン（`users` / `walks` / `sanpo_maps` / `maps` など）ごとにフォルダを分け、その中で層を分ける。
    `sanpo_maps` は地図・ピン・写真という複数エンティティを持つドメインで、内部を3つの
    サブパッケージに分ける（後述「複数エンティティを持つドメイン（`sanpo_maps/`）」、ADR-011, SS-137）。
  - レイヤーは **router → service → repository** の3層。
    - `router`: HTTPの入出力の受け渡しのみ。**薄く保つ**（バリデーションと依存解決、serviceの呼び出し）。
    - `service`: ビジネスロジック。トランザクション境界・ユースケースを持つ。
    - `repository`: DBアクセス（SQLAlchemyクエリ）を隔離する。
- **外部API（Google Maps Platform）は `integrations/` に隔離**し、ドメインの service から利用する。コスト/レート対策のキャッシュもここに閉じ込め、クライアントから直接叩かない。
- **テストはテスト対象の近くに `tests/` サブフォルダで併置（co-location）** する（詳細は後述）。

## 全体構造

```
packages/backend/
├── compose.yaml               # api / db コンテナ定義（+ profile `observability` の jaeger。SS-178）
├── Dockerfile
├── pyproject.toml             # uv 依存管理・ruff 設定・pytest 設定
├── uv.lock
├── alembic.ini
├── .env / .env.example        # ポート・DB接続・プロジェクト名など
├── template.yaml               # AWS SAM テンプレート（Lambda / Function URL / ロググループ。SS-67）
├── samconfig.toml              # SAM の dev/prod config-env（stack_name / region / tags 等。SS-67）
├── Makefile                    # SAM `BuildMethod: makefile` のビルドターゲット（SS-67）
├── events/                     # `sam local invoke` / `aws lambda invoke` 用の payload・env-vars（SS-67）
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
│       │   ├── api.py         #   Lambda ハンドラ。main.app の import 前にシークレットをハイドレーションし、後で build_handler() を呼ぶ
│       │   ├── asgi_handler.py #  Mangum を lifespan=off で包み、FastAPI の lifespan を init で1回だけ起動する。import しても副作用なし
│       │   ├── migrate.py     #   Alembic upgrade head を実行する専用 Lambda ハンドラ
│       │   ├── tracing.py     #   Lambda 計装の親スパンの補正（http.target のクエリ除去、スパン名・http.route の付け直し。SS-178/ADR-013）
│       │   └── tests/         #   このモジュールのテスト（併置）
│       │
│       ├── core/              # 横断的関心事（ドメインに属さない土台）
│       │   ├── pagination.py  #   keyset（cursor）ページネーションの汎用ユーティリティ
│       │   ├── geo.py         #   ドメイン横断で使う共有スキーマ（GeoPoint 等）
│       │   ├── middleware.py  #   ASGI ミドルウェア（RequestSizeLimitMiddleware 等）
│       │   ├── observability.py #  アクセスログ（AccessLogMiddleware）とロギング設定（configure_logging）。SS-88/ADR-009 決定13。末尾にトレース計装（FastAPI・SQLAlchemy・httpx・threading の手動計装、クエリ除去フック、resolve_route_template。SS-178/ADR-013）
│       │   ├── runtime_config.py #   シークレット JSON → 環境変数のハイドレーション（SS-67）
│       │   ├── feature_flags.py  #   フィーチャーフラグの評価層（登録簿 + AppConfig 文書 → 判定。SS-98/ADR-008）
│       │   └── tests/         #   このモジュールのテスト（併置）
│       │
│       ├── integrations/      # 外部API連携（隔離層）
│       │   ├── google_maps/   #   Places / Routes クライアント + キャッシュ
│       │   └── aws/           #   Secrets Manager 取得（boto3）+ プロセス内キャッシュ（SS-67）。
│       │                       #   appconfig.py は AppConfig（boto3 appconfigdata）の取得層（SS-98）。
│       │                       #   s3.py は写真ストレージ（S3 / fake / unconfigured）の抽象化層（SS-88）
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
│       ├── maps/              # ドメイン: 往復範囲探索・ルート算出の proxy エンドポイント
│       │   ├── geometry.py    #   DB/HTTPを持たない純粋な幾何関数（haversine/bearing/resample等）
│       │   └── loop_route.py  #   周回ルートの経由点生成・妥当性判定（SS-33, ADR-007。walks/stats.py と同じ位置づけ）
│       ├── sanpo_maps/        # ドメイン: 地図・ピン・写真（1つの境界づけられたコンテキスト。
│       │   │                  #   SS-88, ADR-009。内部構成は ADR-011, SS-137）
│       │   ├── models.py      #   全6モデル（SanpoMap/SanpoMapMember/Pin/PinTag/PinPhoto/
│       │   │                  #   PinPhotoUpload）を1ファイルに集約（共有カーネル）。
│       │   │                  #   値域の定義（`SANPO_MAP_ROLES`・`SanpoMapIcon`・
│       │   │                  #   `PIN_PHOTO_UPLOAD_STATUSES`）も置き、CHECK 制約と API スキーマで共有する
│       │   ├── exceptions.py  #   ドメイン全体の例外（共有カーネル）
│       │   ├── permissions.py #   SanpoMapRole と role による権限判定の純粋関数（共有カーネル）。
│       │   │                  #   追加系（can_add_pin/can_add_pin_photo/can_add_pin_tag）は role
│       │   │                  #   だけ、更新・削除系（can_update_pin/can_delete_pin/
│       │   │                  #   can_delete_pin_tag/can_delete_pin_photo）は is_creator/
│       │   │                  #   is_uploader をキーワード専用引数に取る（SS-112）。地図そのものの
│       │   │                  #   管理系（can_update_sanpo_map/can_delete_sanpo_map）は role の
│       │   │                  #   みで owner 限定（SS-113）
│       │   ├── advisory_locks.py #   advisory_lock_key()（共有カーネル。owner 単位ロックと
│       │   │                  #   アップロード枠ロックの共通の鍵導出。SS-137）
│       │   ├── conftest.py    #   モジュール全体のテスト fixture
│       │   ├── tests/         #   モジュール全体のテスト（test_architecture.py が M1〜M5・M7・M8 を AST で検査）
│       │   ├── maps/          #   サブパッケージ: 地図（SanpoMap）とメンバーシップ。
│       │   │   ├── router.py  #     GET/POST /sanpo-maps, PATCH/DELETE /sanpo-maps/{id}（SS-113）,
│       │   │   │              #     GET /sanpo-maps/{id}/tags（SS-136）
│       │   │   ├── access.py  #     SanpoMapAccess（ピン作成・写真操作のための地図解決。
│       │   │   │              #     commit しない部品。SS-137）
│       │   │   └── mappers.py #     to_sanpo_map_read() に SanpoMapRead の組み立てを集約（SS-113）
│       │   ├── pins/          #   サブパッケージ: ピン・タグ・ピンに紐付いた写真（行）。
│       │   │   ├── router.py  #     POST /pins, POST /pins/{pin_id}/photos, GET /pins,
│       │   │   │              #     GET /pins/{pin_id}, GET /pins/{pin_id}/photos,
│       │   │   │              #     PATCH /pins/{pin_id}, DELETE /pins/{pin_id},
│       │   │   │              #     DELETE /pins/{pin_id}/photos/{photo_id}（SS-112）
│       │   │   └── tag_labels.py #   タグの正規化・重複排除（純粋関数）
│       │   └── photos/        #   サブパッケージ: 写真の実体（S3）とアップロード枠。
│       │       ├── router.py  #     POST /pin-photo-uploads, DELETE /pin-photo-uploads/{upload_id}
│       │       │              #     （旧 pins/upload_router.py。SS-137 で改名）
│       │       ├── dev_storage_router.py # STORAGE_MODE=fake 限定の /dev-storage/*（include_in_schema=False）
│       │       ├── photo_attacher.py     # 写真の確定処理（検証・サムネイル生成・並列化・時間予算）
│       │       ├── thumbnails.py         # Pillow によるサムネイル生成（純粋関数）
│       │       ├── photo_keys.py         # staging/original/thumb の S3 キー組み立て（純粋関数）
│       │       └── cleanup.py            # PhotoObjectCleaner（DB commit 後の best-effort な
│       │                                 #   S3 オブジェクト削除。旧 PinService._delete_photo_
│       │                                 #   keys_best_effort。SS-137）
│       ├── health/            # ドメイン: 疎通確認（GET /health）。router.py のみ（DB もロジックも持たない）
│       ├── api_docs/          # ドメイン: API ドキュメント UI（GET /docs = Scalar）。router.py のみ。
│       │                       #   include_in_schema=False（openapi.yaml に載せない）。
│       │                       #   ENV=production では include しない（main.py。SS-131）
│       └── app_config/        # ドメイン: mobile / LP 向け公開設定（GET /app-config, SS-98/ADR-008）
│           ├── __init__.py
│           ├── router.py      #   service.py を置かない（ロジックは core/feature_flags.py 側にある。health/ と同じ判断）
│           ├── schemas.py     #   AppConfigRead / MinimumSupportedVersionsRead
│           ├── dependencies.py #   get_feature_flags(request) -> FeatureFlags（app.state から取得。maps/dependencies.py と同じ形）
│           └── tests/         #   このドメインのテスト（併置）
│
├── alembic/
│   ├── env.py                 # all_models.py の Base を参照してメタデータを集約
│   └── versions/              # マイグレーションスクリプト
│
├── scripts/
│   ├── start-api.sh                  # api コンテナの起動コマンド（TRACING_ENABLED=true なら opentelemetry-instrument 経由。SS-178）
│   ├── seed.py                       # Seeder（初期データ投入）
│   ├── export_openapi.py             # openapi.yaml/json の再生成（mobile の Orval が消費）
│   ├── feature_flags_document.py     # フラグ切り替えワークフローが AppConfig に投入する版の組み立て（SS-99。標準ライブラリのみ）
│   ├── loop_route_probe.py           # 周回ルートの実API検証スクリプト（開発者専用。SS-33, ADR-007）
│   └── loop_route_probe_cases.yaml   # ↑の検証セット（O/D の組とラベル）
│                                      #   出力は `tmp-probe/<timestamp>.geojson`（.gitignore 済み）
│
├── feature-flags.json         # フラグ定義ファイル（AppConfig FeatureFlags 形式・既定値。キーは core/feature_flags.py と一致させる）
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
  **（SS-137 追補）** `sanpo_maps` の地図・ピン間の依存は port ではなく `sanpo_maps` モジュール
  内部の部品（`sanpo_maps/maps/access.py` の `SanpoMapAccess`・`sanpo_maps/photos/cleanup.py` の
  `PhotoObjectCleaner`）に置き換わったため、ここに置いていたドメイン間 port の配線
  （`get_sanpo_map_contents()`）は撤去した（ADR-011）。

### `core/` — 横断的関心事
- どのドメインにも属さない土台。ページングなどの汎用処理に加え、`geo.py` の `GeoPoint` のようなドメイン横断で使う**共有スキーマ**、`middleware.py` の `RequestSizeLimitMiddleware` のような**ASGI ミドルウェア**、`observability.py` の `AccessLogMiddleware` / `configure_logging()` のような**可観測性の土台**（1リクエスト1行のアクセスログとロギング設定。SS-88/ADR-009 決定13）、`feature_flags.py` の `FeatureFlags` のようなフィーチャーフラグの評価層（登録簿 + 取得済み文書 → 判定。ADR-008/SS-98）もここに置く。「特定のドメインに閉じない」ものを置く場所であり、対象はユーティリティ関数に限らない。
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
  `appconfig.py` は AWS AppConfig（boto3 `appconfigdata`）の取得層（transport）で、
  「AppConfig からどう取るか」だけをここに閉じ込め、評価ロジックは `core/feature_flags.py`
  に持たせる（ADR-008 追補 D3, SS-98）。

### `aws_lambda/` — AWS Lambda 固有の受け皿（ECS 移植性の境界）
- Lambda 固有のコードは**このパッケージにのみ**置く。ECS へ移す際はこのパッケージを使わないだけで済むようにする制約（grep で機械的に検査できる）。
- `api.py`: Lambda ハンドラ。`core/runtime_config.py` のハイドレーションを `sanposcape.main` の
  import より**前**に実行してから `app` を import し、その**後**で `build_handler(app)` を呼ぶ
  （ハイドレーション → `main` の import → lifespan の起動の順。順序が意味を持つ 1 ファイルの責務）。
- `asgi_handler.py`: `build_handler(app)` / `AsgiLambdaHandler`。import しても何も起動しない
  （副作用は生成時だけ）。Mangum を `lifespan="off"` で包み、FastAPI の lifespan
  （`main._lifespan`）の startup を**生成時（Lambda の init）に1回だけ**起動する。
  - mangum 0.22.0 の `lifespan="auto"` は**呼び出しごとに** startup / shutdown を回すため、
    `_lifespan` が作る資源（Maps provider とキャッシュ・レート制限・AppConfig のセッション・
    S3 クライアント）が呼び出しごとに作り直されていた（SS-183）。
  - **shutdown は走らせない**（実行環境の破棄で資源も消える）。`close()` はテスト専用。
  - lifespan の **state は使えない**（`lifespan="off"` の Mangum は state を scope に載せない。
    state を yield する lifespan は起動時に `RuntimeError`）。共有する資源は `app.state` に置く。
  - startup の例外は ERROR ログ（`Application startup failed during Lambda init.`）を出して
    再送出する（init エラーになる。deployment.md §7）。
  - 同期のコードからだけ呼ぶこと（生成時に `run_until_complete()` を使う）。
  - 経緯と決定は [ADR-005 SS-183 追補](../../../docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md)。
- `migrate.py`: Alembic `upgrade head` を実行する専用 Lambda（API 本体のハンドラでは走らせない）。
- `main.py` の `create_app()` / `app` はこのパッケージから独立しており無変更のまま。ECS では
  従来どおり `uvicorn sanposcape.main:app` で動く。

### `<domain>/` — ドメイン単位の凝集
- 1つのドメインに属する `router / schemas / models / service / repository / dependencies / exceptions` をまとめる。
- **層をまたぐ呼び出しは一方向**にする: `router → service → repository`。逆流させない。
- 他ドメインから使う必要が出たものは `core/` へ昇格させる（ドメイン間の直接依存を増やさない）。
- ただし、片方のドメインがもう片方に**構造的に依存する**関係（例: `auth → users`）は例外として
  一方向の直接依存を許容する。
  - **（SS-137 追補）** 地図とピンの関係は「別ドメインが構造的に依存する」形から、
    「1つのドメイン（`sanpo_maps`）の中のサブパッケージ」に置き換わった。地図の中身の集計・
    削除時の後始末は port（Protocol・依存性逆転）ではなく、依存の向きに沿った通常の部品
    （`sanpo_maps/maps/access.py`・`sanpo_maps/photos/cleanup.py`）と `Repository` のクエリで
    解決する。詳細は
    後述「複数エンティティを持つドメイン（`sanpo_maps/`）」と ADR-011 を参照。
  - 昇格時は、**旧 import 位置に再エクスポートを残して段階移行する**（OpenAPI のコンポーネント名を変えないため）。
    実例: `GeoPoint` は `maps/schemas.py` から `core/geo.py` へ昇格したが、`maps/schemas.py` は
    `from sanposcape.core.geo import GeoPoint` を再エクスポートし続けている。クラス名を変えていない
    ため、生成される OpenAPI のコンポーネント名（`GeoPoint`）にも変化はない。

### 複数エンティティを持つドメイン（`sanpo_maps/`）（SS-137, ADR-011）

複数のエンティティが強く結びついているドメインは、`<domain>/` を素直に分割すると
サブドメイン間で双方向の依存が生まれてしまう。`sanpo_maps`（地図・ピン・写真）はこの形の実例。

1. **いつこの形にするか**: 複数のエンティティが次のいずれかを共有し、別ドメインに分けると
   双方向の依存が要る場合。
   - 権限（メンバーシップ）を共有する
   - ライフサイクル（`ON DELETE CASCADE` 等）を共有する
   - 同じトランザクションでの更新を要求する

   どれにも当てはまらなければ、通常どおり別ドメインに分けて一方向の依存にする
   （`auth → users` のような構造的依存の例外はそのまま使ってよい）。

2. **形**: ドメイン直下は**共有カーネル**だけにする（`models.py` に全モデル、
   `exceptions.py`、`permissions.py` 等の DB に依存しない純粋関数、`advisory_locks.py` のような
   複数サブパッケージが使う小さな共通部品）。`router`/`service`/`repository` はドメイン直下に
   置かず、サブパッケージ（`maps/`・`pins/`・`photos/`）に置く。サブパッケージの中は通常の
   ドメインと同じ役割名のファイル（`router.py`/`service.py`/`repository.py`/`schemas.py`/
   `mappers.py`/`dependencies.py`）にする。テストは各サブパッケージの `tests/` に、
   ドメイン全体に関わるテスト（依存方向の検査等）は `sanpo_maps/tests/`、共通 fixture は
   `sanpo_maps/conftest.py` に置く。

3. **依存の向きとモジュール内規則（M1〜M9）**:

   ```
               pins ─────────┐
                │            │
                ▼            ▼
               maps ──────► photos
                │            │
                ▼            ▼
         共有カーネル（models / exceptions / permissions / advisory_locks）
   ```

   下位（`photos`）は上位（`maps`・`pins`）を import しない。詳細な規則 M1〜M9 は
   [ADR-011](../../../docs/adr/ADR-011-sanpo-maps-module-structure.md) を参照。特に、
   **双方向の依存が必要になった（下位サブパッケージが上位の業務ロジックそのものを必要とする）
   場合は、port（Protocol）やメソッドインジェクションで回避せず、ユースケース層
   （`sanpo_maps/usecases/`）を導入する（M9）**。この判断は `sanpo_maps/tests/
   test_architecture.py` が AST で検査している（`test_no_protocol_ports` が
   `sanpo_maps` 本体で `Protocol` を定義していないことを固定する）。

4. **パスの書き方**: `sanpo_maps/maps/` はアプリ直下の `maps/`（探索・経路算出ドメイン）と
   同名になる。import は常に `sanposcape.sanpo_maps.maps.*` のように完全修飾するため実害は
   無いが、ドキュメント・コメント・agent-memory では**必ずモジュール名から書く**
   （`sanpo_maps/maps/service.py` のように書き、単に `maps/service.py` と書かない）。

5. **サブパッケージを増やす判断**: 新しいエンティティ群が独自の `router` とテーブルを持ち、
   既存サブパッケージとの依存が一方向（上図の並びのどこかに追加できる形）に収まるなら
   サブパッケージとして追加してよい。追加したら `sanpo_maps/tests/test_architecture.py` の
   許可表（`_ALLOWED_SUBPACKAGE_DEPENDENCIES`・`_ALLOWED_PUBLIC_SURFACE`）と ADR-011 を
   追補として更新する。

### レイヤーの配置判断
> - HTTPの入出力・依存解決だけ → `router.py`
> - ユースケース／ビジネスルール → `service.py`
> - DBクエリ → `repository.py`
> - 外部API呼び出し → `integrations/`（service から利用）
>
> 迷ったらまず `service.py` に書き、DBアクセスが増えたら `repository.py` に切り出す。

### 現在時刻の扱い（クロック注入）
- **現在時刻に依存する service・部品は、`now: Callable[[], datetime] = lambda: datetime.now(UTC)` を
  コンストラクタ引数で注入可能にする**。採用済み: `auth/service.py` の `AuthService`（トークンの有効期限）、
  `walks/service.py` の `WalkService`（集計の「今日」判定）、`sanpo_maps/pins/service.py` の
  `PinService`/`sanpo_maps/photos/service.py` の `PinPhotoUploadService`（アップロード枠の期限・
  確定時刻）、`sanpo_maps/maps/access.py` の `SanpoMapAccess`（地図の `updated_at` 更新。**SS-137
  追補**: 旧 `SanpoMapService` から移った。`SanpoMapService` 自体はもう `now` を持たない）。
  `sanpo_maps/photos/photo_attacher.py` の `PhotoAttacher`・`sanpo_maps/photos/cleanup.py` の
  `PhotoObjectCleaner`（**SS-137 追補**: 新設）は `datetime` ではなく
  `monotonic: Callable[[], float] = time.monotonic` を同じ発想で注入する（確定処理・削除の
  時間予算の締め切り判定。壁時計ではなく経過時間だけが必要なため）。
- service 内に `datetime.now()` を直接書かない。テストから時刻を固定できず、日付境界の検証が書けなくなる
  （書けたとしても実行日に依存する不安定なテストになる）。
- `dependencies.py` の `get_xxx_service()` は既定値のまま生成し、注入はテストからのみ行う。
- 日付計算そのものは DB / Pydantic に依存しない純粋関数モジュールへ切り出す（実例: `walks/stats.py`）。
  こうすると DB を立てずに境界条件のテストが書ける。同じ方針は現在時刻に限らず、DB・HTTP を
  持たない計算全般に当てはまる（実例: `maps/geometry.py`・`maps/loop_route.py` の幾何計算・
  周回ルートの妥当性判定。SS-33, ADR-007）。

### `models.py` の配置と Alembic
- SQLAlchemy モデルは**各ドメインの `models.py` に併置**する。
  複数エンティティを持つドメイン（`sanpo_maps/`）は、サブパッケージに分けず**ドメイン直下の
  `models.py` 1ファイルに全モデルを置く**（サブパッケージの `Repository` が互いのテーブルを
  JOIN・集計するため、モデルを分けるとモデルの import だけでサブパッケージ間が循環してしまう。
  SS-137, ADR-011）。
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
- テスト用DBの分離方式: スキーマは pytest の session スコープで1回だけ作り、各テストの前に
  テーブルの中身を DELETE で空にする（テストごとに `create_all`/`drop_all` はしない）。
  テストは実際に commit してよく、テスト中に DDL は実行しない。詳細は
  [ADR-B-001](./adr/ADR-B-001-test-db-isolation-by-table-reset.md) を参照。
  - 約束事: テスト中に DDL（`CREATE`/`ALTER`/`DROP`/`TRUNCATE`等）を実行しない。
  - 約束事: session/module スコープの fixture で DB にデータを入れない（入れても各テストの
    前に消える）。
  - 約束事: PostGIS 等の拡張を追加するとき、または migration で投入するマスタデータに
    依存するモデルを追加するときは、`_delete_all` の対象（`Base.metadata.sorted_tables`）と
    seed/拡張由来データの扱いを見直す。
  - トラブルシューティング: `lock_timeout` 超過でテストが失敗した場合、原因は多くの場合
    「直前まで実行されていた別のテストが接続を閉じ忘れ `idle in transaction` のまま
    残っている」ことにあり、失敗自体は「たまたま次に実行された無関係なテスト」の setup
    として現れる。テスト用DBで
    `SELECT pid, state, query, state_change FROM pg_stat_activity WHERE state = 'idle in transaction';`
    を実行し、長時間 `idle in transaction` の接続を探す（詳細は ADR-B-001 決定4）。

## コマンド実行

- `alembic` / `ruff` / `pytest` は**必ず Docker コンテナ内で実行**する（詳細は [ローカル開発ガイド](./local-development.md)）。
