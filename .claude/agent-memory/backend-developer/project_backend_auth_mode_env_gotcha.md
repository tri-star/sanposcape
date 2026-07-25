---
name: backend-auth-mode-env-gotcha
description: packages/backend/.env.example はAUTH_MODE=devが既定。ambientなmain.appに依存するテストはローカルとCIで結果が変わりうる
metadata:
  type: project
---

`packages/backend/.env.example`（および開発者が生成する `.env`）は、ローカル開発 / Maestro E2E の
利便性のため `AUTH_MODE=dev` を既定値にしている（ADR-002 / SS-10 backend-plan §7.2）。
一方 `Settings.auth_mode` のコード上の既定値（fail-safe）は `"real"`。

**Why:** `packages/backend/src/sanposcape/main.py` の `app = create_app()`（モジュールスコープ）は
`get_settings()`（`.env` を読む）を使って構築される。そのため、`docker compose exec api uv run pytest`
をローカルで実行すると、ambient な `main.app` は `.env` の `AUTH_MODE=dev` を拾って **dev モードで
構築される**。CI（`backend-ci.yml`）は `.env` を使わず `AUTH_MODE: real` をワークフロー側で明示する
ため real になる。つまり `AUTH_MODE` の実効値がローカルとCIで異なりうる。

**How to apply:** `AUTH_MODE` の値そのものをアサートするテスト（例:
「既定設定では `/auth/dev-session` が404になる」「`AUTH_MODE`を変えてもOpenAPI出力が同一」）を書くときは、
ambient な `main.app`／既存の `client` フィクスチャに頼らず、テストコード内で明示的に
`Settings(auth_mode="real", ...)` を構築し `create_app(settings)` した専用クライアントを使うこと。
`AUTH_MODE` に依存しないテスト（`/auth/session` `/refresh` `/logout` `/me` など常時 include される
エンドポイント）は従来通り ambient な `client` フィクスチャで問題ない。
（実装箇所: `src/sanposcape/auth/tests/test_dev_router.py` の `real_client` フィクスチャ参照）
