---
name: testing
description: backend の pytest の罠。AUTH_MODE に依存するテストは ambient な main.app を使わない、認証付き差し替え fixture は walks_client の上に組む、import 順序の検証（別名 fresh import・sys.modules 退避）、モジュール再 import 後は親パッケージ属性も戻す、モジュール定数は import 先を monkeypatch、src の外のテストには src の conftest の fixture・環境の隔離が効かない
metadata:
  type: feedback
  scope: durable
---

テストの結果がローカルと CI で食い違う・無関係な 401 になる・テストが何も検証していない、の原因になった罠（SS-10・SS-42・SS-67・SS-100・SS-183）。

**Why:** `.env.example`（→ 開発者の `.env`）は `AUTH_MODE=dev`・`FEATURE_FLAG_MODE=stub` を配るが、`Settings` のコード上の既定値は `real` で、
CI は `.env` を使わず `AUTH_MODE: real` を明示する。また pytest は collection で多くのモジュールを先に import するので、import 順序や
モジュール定数を扱うテストは素直に書くと何も検証していない。

`Settings(...)` が `.env` / OS 環境変数から隔離されていること（DB 接続だけは例外）は `packages/backend/docs/local-env.md`
「テストと `.env` の関係（SS-100）」が正本。

## 1. `AUTH_MODE` の値に依存するテストは ambient な app を使わない

ambient な `main.app`／既存の `client` fixture はローカルでは dev、CI では real で構築される。「既定設定では `/auth/dev-session` が 404」
「`AUTH_MODE` を変えても OpenAPI 出力が同一」のようなテストは、テスト内で `Settings(auth_mode="real", ...)` を明示して `create_app(settings)` した
専用クライアントを使う（実例: `auth/tests/test_dev_router.py` の `real_client`）。常時 include されるエンドポイントは ambient な `client` でよい。

## 2. 認証付きエンドポイントの差し替え fixture は `walks_client` 系の上に組む

`auth_headers` は `test_settings`（`AUTH_MODE=real`、`auth_jwt_secret="x"*32`）の鍵でトークンを署名する。素の `client` fixture は `get_db` しか
override しないので、その上にクロック注入などの fixture を組むと ambient な鍵と食い違って 401 になる。`get_settings` の override を持つ
`walks_client`（`walks/tests/conftest.py`）を土台にする。`client` を直接使うのは未認証系のテストだけ。

## 3. 「import 時点で特定の関数が呼ばれない」「X の import が Y より前」を検証する

- 呼ばれないこと: `importlib.util.find_spec(name)` → `module_from_spec` → `sys.modules[alias] = module` → `spec.loader.exec_module(module)` →
  `finally` で `sys.modules.pop(alias, None)`。別名の使い捨てモジュールなので、そのモジュールが定義するクラス（`Base` など）が衝突しない。
- 順序: 別名 import だけでは不十分（Y 側の絶対 import が正規名でキャッシュされる）。起点と終点を `monkeypatch.setattr` で spy にして
  `call_order` に記録し、終点側（例: `sanposcape.main`）を `sys.modules` から退避してから起点を含む親モジュールを fresh import し、
  `assert call_order == [...]` で固定する。
- `lru_cache` 関数の `cache_clear` は `monkeypatch.setattr(get_settings, "cache_clear", spy)` で差し替えられる（元を呼べばクリアは保たれる）。

## 4. モジュールを再 import したら、`sys.modules` と親パッケージ属性の両方を戻す

`sys.modules.pop("sanposcape.main")` で再 import すると、import システムが親パッケージの属性 `sanposcape.main` も新 module で上書きする。
`sys.modules` だけ戻すと、後続テストの `monkeypatch.setattr("sanposcape.main.build_x", ...)`（文字列指定は属性経由で解決）が古い module を指し、
パッチが効かない。SS-183 で、テスト実行順によってだけフェイクが効かない形で発覚した（単独実行では通る）。

**How to apply:** 手書きの try/finally より `monkeypatch.delitem(sys.modules, ...)` と `monkeypatch.setattr(<親パッケージ>, "<名前>", 元の module)` を使う。
文字列パッチが「全体実行でだけ」効かないときはまずこれを疑う。

## 5. モジュール定数の monkeypatch は import 先の namespace を対象にする

`walks/stats.py` の `WALK_STATS_STREAK_CHUNK_SIZE` を `walks/service.py` が `from ... import` している場合、`monkeypatch.setattr(stats_module, ...)` は効かない。
service 側が import 済みの名前を見ているので `monkeypatch.setattr(service_module, ...)` にする。チャンク境界越えのテストで特に注意。
再エクスポートのファサード経由でも同じ（[[module-relocation]]）。

関連: [[sqlalchemy-and-db]] [[observability]]

## 6. `src/` の外（`scripts/` など）のテストには、src の conftest の fixture も環境の隔離も効かない

conftest は置いたディレクトリより下にしか効かないので、`testpaths` に `scripts/...` を足しても、`src/sanposcape/conftest.py` の
DB の fixture（`db_session`・テーブルの空にし方）と `_isolate_settings_from_ambient_env`（環境変数・`.env` の遮断）は効かない。
SS-237 では、`scripts/walkshare_migration` のテストが CI でだけ `failed to resolve host 'db'` で全て落ちた。
src のテストは環境変数を消した状態で `get_settings()` を呼ぶことがあり、そのあとの `get_settings()` のキャッシュは既定値（`db_host="db"`）になる。
src の後に走るテストがそれを読んでいた。コンテナでは `db` で繋がるので、手元の全体の実行でも気づけない。

**How to apply:** `src/` の外のテストは、DB の fixture を自分で持つ。`Base.metadata.create_all`、テストの前の DELETE（`SET LOCAL lock_timeout` 付き）。
接続先は、テストの中の `get_settings()` ではなく、モジュールの import（collection）の時点で作った `Settings()` から取る（`src/sanposcape/conftest.py` と同じ）。
`Settings(...)` を組み立てるときは、接続先（`database_dsn=""`・`db_*`）を明示する。
CI と同じ条件で確かめるには、host から `DB_HOST=localhost DB_PORT=<db の公開ポート>` で全体の `pytest` を流す
（コンテナの `.venv` は root の持ち物なので、`UV_PROJECT_ENVIRONMENT` で別の場所を指す）。
