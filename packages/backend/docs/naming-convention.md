# 命名規則 (backend)

FastAPI + SQLAlchemy + Pydantic による backend のファイル名・シンボル命名規則をまとめる。
フォルダ構造そのものは [フォルダ構造](./folder-structure.md) を参照。

## 基本方針

- Python の標準（PEP 8）に従う。
- ドメイン内のファイル名は**役割で固定**する（`router.py` / `service.py` / `repository.py` / `schemas.py` / `models.py` など）。ドメイン名はフォルダで表現し、ファイル名に重ねない（`walk_service.py` ではなく `walks/service.py`）。

## case style 一覧

| 対象 | 規則 | 例 |
|---|---|---|
| フォルダ / パッケージ | snake_case（小文字） | `walks/`, `google_maps/` |
| モジュール（.py） | snake_case | `service.py`, `repository.py` |
| クラス全般 | PascalCase | `WalkService` |
| SQLAlchemy モデル | PascalCase・**単数** | `Walk`, `Spot`, `User` |
| Pydantic スキーマ | PascalCase + 用途接尾辞 | `WalkCreate`, `WalkRead`, `WalkUpdate` |
| 関数・メソッド・変数 | snake_case | `get_current_user`, `round_trip_minutes` |
| 定数 | SCREAMING_SNAKE_CASE | `MAX_ROUND_TRIP_MINUTES` |
| 例外クラス | PascalCase + `Error`/例外を表す語 | `WalkNotFoundError` |
| テストファイル | `test_<対象>.py` | `test_service.py`, `test_router.py` |
| テスト関数 | `test_` + snake_case | `def test_create_walk_success():` |

## 役割別ファイル名（ドメイン内で固定）

| ファイル | 役割 |
|---|---|
| `router.py` | FastAPI `APIRouter`。エンドポイント定義のみ |
| `schemas.py` | Pydantic モデル（リクエスト/レスポンス） |
| `models.py` | SQLAlchemy モデル |
| `service.py` | ビジネスロジック |
| `repository.py` | DBアクセス（クエリ） |
| `dependencies.py` | ドメイン固有の依存（`Depends` で使う関数） |
| `exceptions.py` | ドメイン固有の例外 |

上記はどのドメインにも共通する基本セット。加えて、以下も共通の基本セット側に含める（複数ドメインで採用済みのため）。

| ファイル | 役割 |
|---|---|
| `mappers.py` | モデル→レスポンススキーマの変換（`from_attributes` で表現できない場合）。`auth/` と `walks/` で採用 |

ドメイン固有の事情がある場合は、役割が一目で分かる名前で追加してよい（固定セットに無理に詰め込まない）。
例: `auth/` ドメインでは以下を追加している。

| ファイル | 役割 |
|---|---|
| `tokens.py` | 自前 access token(HS256) の発行・検証、refresh token の生成/ハッシュ化 |
| `dev_router.py` | `AUTH_MODE=dev` 限定エンドポイントの `APIRouter`。本番相当の `router.py` と分離し、`include_in_schema=False` の制御をここに閉じ込める |
| `providers/` | IdP（Google 等）ごとの ID token 検証実装を隔離するサブパッケージ。プロバイダ追加時はここに1ファイル足すだけで済む |

`walks/` ドメインでは以下を追加している。

| ファイル | 役割 |
|---|---|
| `stats.py` | 集計（`GET /walks/stats`）で使う日付ロジックと定数。DB / Pydantic に依存しない純粋関数だけを置き、現在時刻は必ず引数で受け取る |

## FastAPI / API 関連

- `APIRouter` のインスタンス変数名は `router` に統一する。
  ```python
  router = APIRouter(prefix="/walks", tags=["walks"])
  ```
- URL パスの単語区切りには **ハイフン（kebab-case）を使い、アンダースコア（snake_case）は使わない**。RESTのリソース名は**複数形・小文字**にする。
  - 例: `/walks`, `/walks/{walk_id}`, `/walks/stats`, `/spots`, `/auth/dev-session`（`AUTH_MODE=dev` 限定エンドポイント）
  - コレクション配下に固定セグメントのサブリソースを足すときは、**必ず `/{id}` より前に宣言する**
    （例: `/walks/stats` は `/walks/{walk_id}` より前）。FastAPI は宣言順にマッチするため、後ろに
    置くと `stats` が `walk_id: UUID` のバリデーションに落ちて 422 になる。宣言順が壊れたことに
    気付けるよう、回帰テスト（そのパスが 200 を返すこと）もあわせて置く。
    この制約は**同一 HTTP メソッド内**で効く（例: `GET /walks/stats` の宣言順は
    `DELETE /walks/{walk_id}` の宣言順に影響しない。GET と DELETE は別々にマッチングされるため）。
    将来 `DELETE /walks/stats` のような固定セグメントのエンドポイントを追加する場合は、
    それを DELETE の中で `/{walk_id}` より前に宣言する必要があるが、既存の GET 側の宣言順とは
    無関係（`walks/router.py` のコメントも参照）。
- パスパラメータ名は snake_case（`{walk_id}`）。
- エンドポイント関数名は操作を表す snake_case（`create_walk`, `list_walks`, `get_walk`, `get_walk_stats`, `delete_walk`）。

## Pydantic スキーマの接尾辞

| 接尾辞 | 用途 |
|---|---|
| `...Create` | 作成リクエストのボディ |
| `...Update` | 更新リクエストのボディ |
| `...Read` | レスポンス（クライアントへ返す表現） |
| `...DetailRead` | 詳細取得用のレスポンス。一覧には含めない重い項目を追加する（例: `WalkDetailRead` は `WalkRead` に `track` を追加） |
| `...ListRead` | 一覧レスポンスのラッパ。`items`（`...Read` の配列）+ `next_cursor` を持つ（例: `WalkListRead`） |

- 内部（service間）で使う DTO 的なものは用途が分かる名前を付ける（例: `WalkRouteSummary`）。

## SQLAlchemy / DB

- モデルクラスは PascalCase・単数（`Walk`）、対応するテーブル名は **複数形・snake_case**（`walks`）。
- カラム名は snake_case（`round_trip_minutes`, `created_at`）。
- 外部キーは `<単数リソース>_id`（`user_id`, `walk_id`）。
- 中間テーブルは関連する2リソースを snake_case で連結（`walk_spots` 等）。
- index / constraint 名は `<種別接頭辞>_<table>_<cols>` にする（`cols` はアンダースコア連結）。
  - unique constraint: `uq_<table>_<cols>`（例: `uq_walks_user_client_walk_id`）
  - index: `ix_<table>_<cols>`（例: `ix_walks_user_id_started_at_id`）

## Alembic マイグレーション

- revision 生成時の `-m` メッセージは**内容が分かる snake_case の短文**にする。
  - 例: `add_walks_table`, `add_user_id_to_walks`
- 生成された revision ファイル名（`<hash>_<message>.py`）は Alembic の規約に従う（手で変えない）。

## 「散歩ルート」に関する命名の注意

散歩の「道のり」は意味が2つに分かれるため、コード上でも語を使い分ける（Web フレームワークの
route（画面/URL/`APIRouter`）とも混同しない）。

| 意味 | 語 | 実例 |
|---|---|---|
| ①提示される徒歩経路（散歩前に候補として示すルート） | `walking_route` | `maps/schemas.py` の `WalkingRouteRequest` / `WalkingRouteResponse` |
| ②実際に歩いた軌跡（散歩の記録として保存する座標列） | `track` | `Walk.track_points`（モデル）/ `WalkDetailRead.track`（スキーマ）/ `track_to_storage` / `track_from_storage`（`walks/mappers.py`） |
| ③散歩の記録そのもの | `Walk` | モデル `Walk` / テーブル `walks` |

- ①（`walking_route`）は `maps/` ドメインの責務（探索・経路提案）、②（`track`）は `walks/` ドメインの責務（終了済み散歩の記録）で、実装上も別ドメインに分かれている。
- `router`（FastAPIのルーティング）とは別物である点を、レビュー時にも意識する。

## import の注意（WSL2 / Linux）

- 開発環境は大文字小文字を区別するため、モジュールパスは実ファイル名と case まで一致させる。
- 相対 import よりも `sanposcape.<domain>.<module>` の絶対 import を基本とする。
