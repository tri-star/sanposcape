---
name: pattern_testclient_lifespan_with_block
description: create_app()で組み立てたappをTestClientでラップする際、_lifespanの副作用(app.state.google_maps_provider等)が必要なら`with TestClient(app) as client:`が必須という明文化された規約。意図的に省略する場合は理由をコメント/docstringに残すのが慣習。
metadata:
  type: reference
  scope: durable
---

`main.py` の `_lifespan()` は `app.state.google_maps_provider` / `explore_rate_limiter` /
`feature_flag_source` / `feature_flags` / `object_storage` を設定する。`TestClient(app)` を
`with` 文なしで使うと ASGI の lifespan プロトコルが発火せず、これらが未設定のまま
（AttributeError の温床）になる。

**確立された規約（`packages/backend/src/sanposcape/app_config/tests/test_router.py:32`
のコメント "R7: `_lifespan` を走らせるため `with TestClient(...)` が必須" が明文化）**:
- `conftest.py` の `client` フィクスチャ、`auth/tests/test_dev_router.py` の `real_client`、
  `conftest.py` の `dev_client`、`app_config/tests/test_router.py` の `stub_client` /
  `empty_stub_client` / `unconfigured_client`、`sanpo_maps/conftest.py`（**SS-137 追補**: 旧
  pins/tests/conftest.py。`sanpo_maps`/`pins`統合でモジュール直下に統合された）等はすべて
  `with TestClient(app) as test_client:` を使う。
- 唯一の例外は `tests/test_main.py:151`（`test_access_log_records_the_413_...`）で、
  ミドルウェアが本文サイズ超過を検知してリクエストがルートハンドラ（＝lifespan 依存の状態）
  に到達する前に 413 を返すケース。ここでは `with` を使わなくても安全。

意図的な省略の先例は2つ: `tests/test_main.py:151`（ミドルウェアが413を返しルートハンドラに
到達しないケース）と、`api_docs/tests/test_router.py` の `_client()` ヘルパー（SS-131。`/docs`
`/redoc` `/openapi.json` は `app.state.*` を参照せず、production 相当の Settings で lifespan を
起動して実クライアントを構築したくないため、docstring で省略理由を明記している）。

**How to apply:** 新しい `TestClient(create_app(...))` の使用箇所をレビューするときは、
1. テスト対象のルートが `app.state.*`（lifespan 由来）に依存するか確認する。依存するなら
   `with` 必須（欠けていれば Critical〜Important、AttributeError で落ちるか黙って未定義状態になる）。
2. 依存しない場合でも、`with` を省略する理由をコメントで一言残す方が
   （`test_main.py:151` 相当の暗黙知に頼らず）安全。省略自体は Important というより
   Suggestion/Important の中間（コードベース規約からの逸脱として指摘する）。
