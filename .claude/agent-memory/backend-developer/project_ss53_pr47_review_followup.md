---
name: project-ss53-pr47-review-followup
description: SS-53 (DELETE /walks/{walk_id}) PR #47のCopilotレビュー指摘2件への対応内容と判断ログ
metadata:
  type: project
---

## 経緯

PR #47（backend: 散歩記録の削除API）に対する copilot-pull-request-reviewer の未解決スレッド2件に対応した。詳細は `tmp/SS-53/pr-review-summary.md`（gitignore対象）。

## 対応した2件

1. **`walks/router.py` の413不整合**: `RequestSizeLimitMiddleware`（`core/middleware.py`）は `/walks` 配下の**全HTTPメソッド**のContent-Lengthを一律チェックする実装なのに、`_ERROR_RESPONSES_NO_BODY`（GET/DELETE用）はOpenAPIから413を除外し「GET/DELETEは413が起こり得ない」というコメントを付けていた、という指摘。
   - **判断**: `_ERROR_RESPONSES_NO_BODY` を廃止し、全エンドポイントで413込みの `_ERROR_RESPONSES` に統一（実装の実態にOpenAPI/コメントを合わせる方向）。middleware側（GET/DELETEを対象外にする）は変更していない。
   - **理由**: 既存の413関連テスト（`test_oversized_body_returns_413`はPOSTのみ対象、`test_d_t10_openapi_contract`等は`"401" in operation["responses"]`のような存在チェックのみで413の不在は検証していない）が一切壊れないことを事前確認できたため、router.py側の数行修正で完結する「小規模な修正」であると判断した。オーナー(tri-star)の方針指示「小規模で済むならOpenAPI側を実態に合わせる、GET/DELETE全体への影響が大きいならmiddleware側を直す」に沿う。
   - **詳細な判断ログ**: `tmp/SS-53/handover-notes.md` 項目10に記録済み（gitignore対象なので将来参照時はこのファイル経由で辿る）。
2. **`walks/service.py::delete_walk` のdocstring不正確**: 「見つからなかった場合はrepository側でflushしていないのでrollback不要」としか書かれておらず、`WalkRepository.delete()` が対象行が見つかった場合にflush()している事実、および同時実行競合時にflush()が失敗して0行のままFalseを返す経路があることが抜けていた。
   - **対応**: docstringを(1)見つからず未flush、(2)見つかったが競合でflush失敗、の2パターンに書き直した。挙動変更はなし。rollbackを明示的に呼ばない理由（`get_db`のfinallyで`db.close()`が暗黙にrollbackする）も明記した。

## 判明した事実（次回も使える）

- `walks/tests/test_router.py` のOpenAPI契約テスト（`test_d_t10_openapi_contract` / `test_t2_openapi_contract`）は特定コードの**存在**（`"401" in operation["responses"]`）だけを見ており、**不在**（413が含まれないこと）はアサートしていない。そのため「レスポンスコードをOpenAPIに追加する」系の修正は既存契約テストを壊しにくい。逆に言えば、「このコードは含まれない」ことを保証したい場合は明示的なテストを別途足す必要がある。
- `RequestSizeLimitMiddleware` は `/explore` と `/walks` の両方で使われている汎用ミドルウェア（`core/middleware.py`のdocstring参照）。片方のドメイン都合（GET/DELETE除外など）でmiddleware本体を変更すると影響範囲がドメイン横断になるため、ドメイン固有の修正で完結する方（router.py側）を優先する判断がしやすい。
