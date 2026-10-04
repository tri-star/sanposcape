---
name: project-adot-lambda-mangum-pitfalls
description: ADOT Python レイヤー（AWSOpenTelemetryDistroPython）を Mangum + zip の Lambda に載せるときの罠。操作名が FunctionHandler 固定・zip のライブラリは自動計装されない・SQLAlchemy 2.1 の上限・旧 semconv のみ・Lambda スパンの http.target にクエリ
metadata:
  type: project
  scope: task-local
  source_issue: SS-178
---

（SS-178 で ADR-013 に追補したら、決定事項は ADR を正とし、このメモは削除するか「ADR の参照 + 罠の要点」に縮める）

SS-178（2026-10-04、ADR-013 の計装の実装プラン）で、ADOT のコード（aws-otel-python-instrumentation の main）を読んで分かったこと。
レイヤー v28 の実物と dev の実測で確定させる前提なので、使う前に ADR-013 の SS-178 追補があればそちらを正とする。

- **Application Signals の操作名**: `get_ingress_operation` は、`AWS_LAMBDA_FUNCTION_NAME` がある環境では SERVER スパンを `<関数名>/FunctionHandler` に固定する（Flask のスコープだけ例外）。スパンの `aws.local.operation` は上書きされる。
  Mangum 下の FastAPI スパンは INTERNAL（current span があるため）。このため、子・親の書き換えも、Lambda 計装を外すことも効かない見込み。
- **zip（/var/task）のライブラリは自動計装されない見込み**: `otel-instrument` は `PYTHONPATH` に `/opt/python` と `/var/runtime` だけを足し、sitecustomize で依存チェックをする。fastapi / sqlalchemy / httpx はアプリから手動で `instrument()` する。
  自動に任せられるのは botocore（/var/runtime）と urllib だけ。
- **レイヤーの既定の無効リスト**: `OTEL_PYTHON_DISABLED_INSTRUMENTATIONS` が未設定のときだけ長い既定値が入り、末尾に必ず `,aws-lambda` が付く。上書きすると一斉に有効になる（tasche の `fastapi,starlette,asgi` はこの罠）。
- **SQLAlchemy 2.1**: instrumentation-sqlalchemy 0.65b0 / 0.66b0 は `< 2.1.0` の上限で DependencyConflict になる（contrib#5118）。`skip_dep_check=True` を付ける。
  エラーの status の説明は `str(original_exception)` で、psycopg の DETAIL が載りうる。
- **ADOT は旧 HTTP semconv しか読まない**ので、`OTEL_SEMCONV_STABILITY_OPT_IN=http` は避ける。
- **Lambda 計装の span**（payload 2.0）は `http.target` に `rawQueryString` を含める。フックが無いので、Mangum に渡す app を包んで current span を書き換える。
- `otel_wrapper.py` は `AwsLambdaInstrumentor().instrument()` を無条件に呼ぶ（環境変数で外せない）。flush のタイムアウトは `OTEL_INSTRUMENTATION_AWS_LAMBDA_FLUSH_TIMEOUT`（ms、既定 30000 で Lambda の 29 秒より長い）。

**Why:** ADR-013 は tasche（Lambda Web Adapter）の前例をもとに「子スパンの書き換えで操作名がルート単位になる」「SQLAlchemy・httpx は自動」と書いていたが、Mangum + zip 構成ではコード上どちらも成り立たない。
**How to apply:** ADOT や OTel の計装のプランでは、ADR の前提をそのまま使わない。上の各点を dev の実測チェックリストに入れる。
ルート単位の RED は `aws/spans` の Logs Insights 集計（SS-179）を第一候補にする。関連: [[feedback-check-sibling-tickets-before-shared-infra]]（SS-183 / SS-180 と同じファイルを触る）
