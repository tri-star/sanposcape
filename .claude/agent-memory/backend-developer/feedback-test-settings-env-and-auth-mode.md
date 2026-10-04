---
name: feedback-test-settings-env-and-auth-mode
description: backend テストと .env / OS 環境変数 / AUTH_MODE の関係。Settings(...) は ambient から隔離済みだが、DB 接続と ambient な main.app は .env を拾う。認証付きの差し替え fixture は walks_client 系の上に組む
metadata:
  type: feedback
  scope: durable
---

テストの結果がローカルと CI で食い違う・無関係な 401 になる原因は、たいてい「どの設定がどこから来たか」の取り違え。
SS-10・SS-42・SS-100 で踏んだ内容をまとめる。

**Why:** `.env.example`（→ 開発者の `.env`）は利便性のため `AUTH_MODE=dev`・`FEATURE_FLAG_MODE=stub` を配るが、
`Settings` のコード上の既定値は fail-safe の `real`。CI（`backend-ci.yml`）は `.env` を使わず `AUTH_MODE: real` を
明示する。さらに `compose.yaml` の `api.environment` が `.env` の一部を OS 環境変数としてもコンテナへ渡すので、
`.env` だけ無効化しても値が残る。

**How to apply:**

## 1. テスト内の `Settings(...)` は ambient から隔離済み（SS-100）

`src/sanposcape/conftest.py` の autouse フィクスチャ `_isolate_settings_from_ambient_env` が、各テストの前に
`Settings.model_fields` に対応する環境変数を `monkeypatch.delenv` し、`monkeypatch.chdir(tmp_path)` で
相対パスの `env_file=".env"` を空振りさせる。テストで `Settings(...)` を構築するときは、検証したいフィールドだけを
渡せばよい（渡さなかったフィールドは常にコード上の既定値）。

例外（import 時に評価されるのでフィクスチャが効かない）:
- `conftest.py` モジュールレベルの `settings = get_settings()`（テスト用 DB 接続の組み立て）。DB 接続は引き続き
  `.env` / OS 環境変数から解決される。「.env から一律に独立させる」変更をするときはここを壊さない。
- `main.py` の `app = create_app()`（ambient な `main.app`）。

pydantic-settings には OS 環境変数ソースだけを無効化する単純な kwarg が無い（`_env_file=None` は dotenv のみ）。
「`.env` が無い状態」を手元で再現したいときは、コンテナを作り直すより `/app/.env` だけ消して
「OS 環境変数は残ったまま」という CI より厳しい条件で確認する方が、他 worktree とのポート衝突が無く安全。
詳細は `packages/backend/docs/local-env.md` の「テストと `.env` の関係（SS-100）」節。

## 2. `AUTH_MODE` の値に依存するテストは ambient な app を使わない

ambient な `main.app`／既存の `client` フィクスチャはローカルでは dev、CI では real で構築される。
「既定設定では `/auth/dev-session` が 404」「`AUTH_MODE` を変えても OpenAPI 出力が同一」のようなテストは、
テスト内で `Settings(auth_mode="real", ...)` を明示して `create_app(settings)` した専用クライアントを使う
（実例: `auth/tests/test_dev_router.py` の `real_client`）。常時 include されるエンドポイントのテストは
ambient な `client` のままでよい。

## 3. 認証付きエンドポイントの差し替え fixture は `walks_client` 系の上に組む（SS-42）

`auth_headers` は `test_settings`（`AUTH_MODE=real`、`auth_jwt_secret="x"*32`）の鍵でトークンを署名する。
素の `client` fixture は `get_db` しか override しないので、その上にクロック注入などの fixture を組むと ambient な
`.env` の鍵と食い違って 401 になる。`get_settings` の override を持つ `walks_client`
（`walks/tests/conftest.py`）を土台にする。`client` を直接使うのは未認証系のテストだけ。

関連: [[feedback-full-suite-intermittent-401]]
