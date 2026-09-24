---
name: project_ss131_scalar_docs_review
description: SS-131（/docsをSwagger UIからScalarへ置き換え）のコード品質レビューで確認した所見。api_docs/router.py, main.py, api_docs/tests/test_router.pyが対象。
metadata:
  type: project
  scope: task-local
  source_issue: SS-131
---

2026-09-25 時点でレビュー済み。決定事項は SS-131 の申し送り事項（許可リスト方式で
`env in ("local","test","staging")` のときだけ `/docs` を include、`/redoc` は全環境廃止、
`/openapi.json` は維持、telemetry/agent 無効化、JS版は `@scalar/api-reference@1.67.0` 固定）。

**所見の要点（再利用可能な観点として記録）**:
- `api_docs/tests/test_router.py` は `client = TestClient(app)` を6箇所で `with` なしに使う。
  [[pattern_testclient_lifespan_with_block]] の規約（`app_config/tests/test_router.py` の
  "R7" コメント）から外れるが、`/docs` `/redoc` `/openapi.json` はどれも `_lifespan` が設定する
  `app.state.*` に依存しないため実害はない。ただし省略理由のコメントがない点は指摘した。
- `test_scalar_docs_disables_telemetry_and_agent` の docstring が「（プランの注意事項参照）」で
  gitignore対象の計画ドキュメントを指す。 <!-- tmp-ref-ok: tmp/ 参照そのものを説明している箇所 -->
  [[antipattern_plan_decision_refs]] の再発だが、docstring本文自体が自己完結しているため
  Low/Suggestion 止まり。
- 生JSON文字列（`'"telemetry": false'` 等）へのfragileな一致は、計画段階で JSON 抽出 +
  `json.loads` とのトレードオフを検討済みで「抽出が壊れやすいなら文字列一致で十分」と
  意図的に選択されたもの（この経緯は計画ドキュメントの「注意事項・リスク」節にあるが
  gitignore対象のためここでは要点のみ記録）。 <!-- tmp-ref-ok: tmp/ 参照そのものを説明している箇所 -->
  レビューで「JSONを抽出してparseすべき」と再提案するのは方針の蒸し返しになるため避け、
  「既知のトレードオフとして許容、ただし壊れたときの手順がdocstringに明記されているか」を
  確認する観点に留めるのがよい。
- `router.py` のモジュールレベルコメント（`SCALAR_JS_URL` に12行のコメント）は、このコードベース
  では過剰ではない。`config.py` の `Settings` フィールドも同程度に濃い決定理由コメントが
  標準的な密度（例: `db_disable_prepared_statements`）。「コメントが長い」だけでは
  Suggestion にもしなくてよいプロジェクト。
- `main.py` 側の `docs_url=None` 前後のコメントは router.py のdocstringと役割分担されており
  （main.py は「置き換えた」という要約 + 参照ポインタ、router.py が詳細）、重複ではない。
