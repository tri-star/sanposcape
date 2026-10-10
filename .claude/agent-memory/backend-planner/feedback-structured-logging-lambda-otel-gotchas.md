---
name: feedback-structured-logging-lambda-otel-gotchas
description: ログの JSON 化・例外ログ・ログの文脈（request id / user id）をプランするときの罠。Lambda の LogFormat JSON は例外メッセージを必ず出す、OTel の FastAPI 計装の例外記録はユーザーのミドルウェアより外、同期の依存での ContextVar.set は戻らない、pytest の root のハンドラー
metadata:
  type: feedback
  scope: durable
  verify_by: 2027-04-30
---

SS-180 のプラン作成時（2026-10-10）にソースで確認した。dev での実測はまだ（結果は ADR-013 決定3 の SS-180 追補に入る予定）。

- **Lambda の `LoggingConfig.LogFormat: JSON`（awslambdaric の `JsonFormatter`）は `errorMessage = str(exc)` を必ず出し、trace id は付けない。** `extra=` の属性はトップレベルに出る。request id は `requestId`（camelCase）。REPORT 行も `platform.report` に変わり、SS-179 のダッシュボード（Q5〜Q7）と `test_monitoring_config.py` に響く。例外メッセージを出したくない（ADR-013 決定6）なら、アプリのフォーマッターで出して LogFormat は Text のままにする。
- **Text のときもランタイムは root にハンドラーを付ける**（`aws_request_id` を付けるフィルター付き）。ハンドラーを足すと二重出力になるので、フォーマッターだけ差し替える。pytest では root に caplog のハンドラーがあり、`aws_lambda/tests/test_api.py` が本物の `api.py` を import するので、差し替えは `AWS_LAMBDA_FUNCTION_NAME` があるときだけにする。
- **OTel の FastAPI 計装（0.65b0）は `ServerErrorMiddleware → OTel → ServerErrorMiddleware → ExceptionHandlerMiddleware → [ユーザーのミドルウェア] → ExceptionMiddleware` に組み替える。** `ExceptionHandlerMiddleware` が `record_exception` と status の説明（`Type: message`）を付けるので、最も外側のユーザーのミドルウェア（`AccessLogMiddleware`）で例外を握って 500 を返せば、スパンへのメッセージの漏れも Mangum / uvicorn の二重ログも同時に止まる。逆に、例外ハンドラー（`exception_handler(Exception)`）で 500 を返しても `ServerErrorMiddleware` は再送出するので止まらない。
- **同期の依存（`def` の Depends）はスレッドプールで動き、そこでの `ContextVar.set` は呼び出し元に戻らない。** ユーザー ID などをログの文脈に足すなら、ContextVar にはリクエストごとの可変オブジェクトを入れて属性を書き換える。
- 文脈を format の時点で読む設計では、`caplog` の LogRecord を後で format しても文脈は消えている。テストは emit の時点で format するハンドラーを使う。

**Why:** どれもコードの見た目やミドルウェア単体のテストからは分からず、「二重ログ」「本番ログへのメッセージ漏れ」「ユーザー ID が付かない」として後から気づく種類の問題だから。

**How to apply:** ログ・例外処理・リクエストの文脈を扱うプランでは、例外がどのミドルウェアを通るかを計装の版のソースで確かめ、Lambda の LogFormat を変えるならダッシュボードのクエリへの影響を書く。関連: [[feedback-cloudwatch-observability-query-gotchas]]、[[feedback-lambda-adapter-boundary-assumptions]]
