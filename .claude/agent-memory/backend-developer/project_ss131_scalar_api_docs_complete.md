---
name: project-ss131-scalar-api-docs-complete
description: SS-131（backend の /docs を Swagger UI から Scalar に置き換え、production では非公開）は実装完了
metadata:
  type: project
  scope: task-local
  source_issue: SS-131
---

SS-131（`packages/backend` の API ドキュメント UI を Scalar に置き換える）は実装・テスト・docs 更新・
コミットまで完了（2026-09-25、コミット `d233e0b`、ブランチ `tri-star/ss-131-scalar-api-docs`）。

**Why:** 既定の Swagger UI（`/docs`）・ReDoc（`/redoc`）が環境を問わず公開されていたため、
`/docs` を Scalar（`scalar-fastapi`）に置き換え、`ENV=production` では登録しないようにした
（`/openapi.json` は実行時に Scalar が読むため全環境で維持。**mobile の Orval はコミット済みの
openapi.yaml を読むのであって実行時の `/openapi.json` には依存しない**。ローカルレビュー A で
指摘され main.py のコメントも合わせて訂正した）。

**構成のポイント（今後似た「環境ごとの出し分け」を実装するときの参照）:**
- 新規ドメイン `api_docs/`（`router.py` のみ、`health/` と同じ形）に Scalar を返す
  `GET /docs`（`include_in_schema=False`）を実装。`openapi_url` / `title` は
  `request.app` から取り、router が app を import しない設計。
- `main.py` の登録条件は `settings.env in ("local", "test", "staging")` の許可リスト方式
  （`config.py` が否定リスト方式を避けている理由と同じ: 新しい env 値が安全側から外れないため）。
- `FastAPI(..., docs_url=None, redoc_url=None)` で既定の Swagger UI/ReDoc を廃止。
- Scalar の `telemetry=False` / `agent=AgentScalarConfig(disabled=True)` を明示し、API 仕様が
  外部（Scalar のテレメトリー・Agent 機能）に渡らないようにした。
- 読み込む JS は `scalar-fastapi` の版と組み合わせ実績のある版
  （`https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.67.0`）に固定し、
  `api_docs/router.py` の `SCALAR_JS_URL` 定数1箇所に集約。

**How to apply:** 次に Scalar の版を上げる／設定を変えるときは `api_docs/router.py` と
`api_docs/tests/test_router.py` だけを見ればよい。`get_scalar_api_reference()` が返す設定 JSON の
実際の文字列は `Scalar.createApiReference("#app", {"url": "/openapi.json", "agent": {"disabled": true}, "_integration": "fastapi", "telemetry": false})`
のような形（scalar-fastapi 1.9.0 時点）。区切りが変わってテストが落ちたら、実際の HTML を
出力し直して期待文字列を直す。

関連: [[feedback-sandbox-constraints]]（今回 localhost 疎通確認の新しい知見を追記した）。
