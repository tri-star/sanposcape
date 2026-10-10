---
name: project-ss180-structured-logging-review
description: ログ構造化（SS-180）のレビューで妥当と確認済みの設計（再指摘しない）と、持ち越し論点の所在（正本は ADR-013 の SS-180 追補）
metadata:
  type: project
  scope: durable
  source_issue: SS-180
  adr: docs/adr/ADR-013-observability-adot-application-signals.md
---

正本は ADR-013 決定3/6/7 の SS-180 追補。再指摘しないこと:
- AccessLogMiddleware が未処理例外を握って500を返す設計は妥当。Starlette の `Exception` ハンドラは ServerErrorMiddleware 経由で必ず再送出されるため、二重ログ回避には自前で握るしかない。純ASGIなのでContextVarも保たれる。
- ContextVar に可変 `LogContext` を入れる方式は、同期依存（anyio スレッド）で set が戻らない問題の正解。
- Lambda `LoggingConfig` は Text のまま、フォーマッターだけ差し替える方針は受容済み。

持ち越し論点（`observability.py` の 3 分割、`_EXTRA_KEYS` の拡張点、ThreadPoolExecutor ワーカーに文脈が伝わらない件、uvicorn 経路の第三者ロガー、ExceptionGroup）は ADR-013 の要約「未解決・持ち越し」と決定7 の SS-180 追補にある。

**Why:** レビュー時の再調査コストを減らす。
**How to apply:** SS-181 や observability.py に触れる変更をレビューするとき、上記を前提にし、ADR の持ち越し論点が解消されたか・分割と拡張点の観点だけ確認する。
