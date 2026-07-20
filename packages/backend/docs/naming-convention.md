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

## FastAPI / API 関連

- `APIRouter` のインスタンス変数名は `router` に統一する。
  ```python
  router = APIRouter(prefix="/walks", tags=["walks"])
  ```
- URL パス・パスパラメータは **kebab を使わず snake は使わない**。RESTのリソース名は**複数形・小文字**にする。
  - 例: `/walks`, `/walks/{walk_id}`, `/spots`
- パスパラメータ名は snake_case（`{walk_id}`）。
- エンドポイント関数名は操作を表す snake_case（`create_walk`, `list_walks`, `get_walk`, `delete_walk`）。

## Pydantic スキーマの接尾辞

| 接尾辞 | 用途 |
|---|---|
| `...Create` | 作成リクエストのボディ |
| `...Update` | 更新リクエストのボディ |
| `...Read` | レスポンス（クライアントへ返す表現） |

- 内部（service間）で使う DTO 的なものは用途が分かる名前を付ける（例: `WalkRouteSummary`）。

## SQLAlchemy / DB

- モデルクラスは PascalCase・単数（`Walk`）、対応するテーブル名は **複数形・snake_case**（`walks`）。
- カラム名は snake_case（`round_trip_minutes`, `created_at`）。
- 外部キーは `<単数リソース>_id`（`user_id`, `walk_id`）。
- 中間テーブルは関連する2リソースを snake_case で連結（`walk_spots` 等）。

## Alembic マイグレーション

- revision 生成時の `-m` メッセージは**内容が分かる snake_case の短文**にする。
  - 例: `add_walks_table`, `add_user_id_to_walks`
- 生成された revision ファイル名（`<hash>_<message>.py`）は Alembic の規約に従う（手で変えない）。

## 「散歩ルート」に関する命名の注意

- **散歩の道のり（歩いたルート／提示ルート）** を表す語は、コード上で `walking_route` / `walk_route` などと表記し、
  Web フレームワークの route（画面/URL/`APIRouter`）と混同しない。
  - 例: モデル `WalkRoute`、カラム `route_polyline`、スキーマ `WalkRouteRead`。
  - `router`（FastAPIのルーティング）とは別物である点を、レビュー時にも意識する。

## import の注意（WSL2 / Linux）

- 開発環境は大文字小文字を区別するため、モジュールパスは実ファイル名と case まで一致させる。
- 相対 import よりも `sanposcape.<domain>.<module>` の絶対 import を基本とする。
