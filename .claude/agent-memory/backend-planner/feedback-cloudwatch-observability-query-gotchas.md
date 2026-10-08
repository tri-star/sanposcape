---
name: feedback-cloudwatch-observability-query-gotchas
description: CloudWatch（Application Signals のメトリクス・aws/spans の Logs Insights・ダッシュボード）を使うプランの落とし穴。名前空間の綴り、子スパンの二重カウント、Logs Insights に if が無いこと、log ウィジェットのスキャン費用、DashboardBody の書き方
metadata:
  type: feedback
  scope: durable
  verify_by: 2027-04-30
---

SS-179（API メトリクスのダッシュボード）で確認した（2026-10-05。フィールド名・型・次元・クエリの構文は dev の実データで確認済み。詳細と残る未確認は ADR-013 決定2 の SS-179 追補）。

- **Application Signals の名前空間は `ApplicationSignals`**（AWS のドキュメント）。社内の前例（tasche の template.yaml）は `AWS/ApplicationSignals` と書いており、前例を写すと 0 件になる。ディメンションは `[Environment, Service]` / `[Environment, Service, Operation]`。リクエスト数は `SampleCount(Latency)`。
- **Lambda 上の Application Signals は `Operation` まで指定する。** サービス単位 `{Environment, Service}` には `<関数名>/FunctionHandler` のほか `<関数名>/LambdaService` と `InternalOperation`（初期化時の Secrets Manager 呼び出しなど）も含まれ、件数が二重になる。ダッシュボードもアラームも `{Environment, Operation=<関数名>/FunctionHandler, Service}` で見る。Environment は `deployment.environment` の値（dev では `dev`）。
- **`aws/spans` でルート別に集計するときは、`kind='SERVER'` と `attributes.aws.span.kind='LOCAL_ROOT'` で絞る。** FastAPI の子の INTERNAL スパンが同じ名前（`GET /pins/{pin_id}`）を持つので、絞らないと二重に数える。`LOCAL_ROOT` だけだと初期化時の Secrets Manager の CLIENT スパンも入るので、`kind='SERVER'` は必須。dev は他プロジェクトと共有なので、`resource.attributes.service.name` でも絞る。`kind` は文字列 `'SERVER'`、トレース ID はトップレベルの `traceId`、ルート未一致の 404 は `name` がメソッドだけ（`GET`）で `http.route` が無い。
- **ステータスは旧 semconv の `attributes.http.status_code`。** `OTEL_SEMCONV_STABILITY_OPT_IN` を設定していないため。値は数値。AWS のドキュメントの例は `http.response.status_code` なので、そのまま写さない。
- **Logs Insights の `stats` には if / case が無い。** 4xx・5xx の件数は `floor(status/400) - floor(status/500)` / `floor(status/500)` で 0/1 を作って `sum` する（dev で構文が通ることを確認済み。`fields` で付けた別名は次の `fields` で参照できる）。`count(field)` は、そのフィールドを持つレコードだけを数える（`count(@initDuration)` でコールドスタートの件数になる）。
- **log ウィジェットは、開く・更新するたびに、期間内のロググループ全体をスキャンして課金される**（`filter` ではスキャン量は減らない）。自動更新を付けたままにすると高くつく。費用の見積りは「1 回あたりのスキャン量 × 開く回数」で示す。
- **DashboardBody を `Fn::ToJsonString` で YAML から作る案は、sam-deploy が `AWS::LanguageExtensions` の Transform を許可していないので不可。** `!Sub |` で JSON を直書きし、クエリの文字列リテラルはシングルクォートにする（JSON のエスケープが要らない）。JSON として正しいかは pytest で固定する。
- `logs:PutQueryDefinition` はリソースレベルの絞り込みに対応しない見込み。共有の dev では、保存済みクエリを作らない方向にした。

**Why:** どれも、コードやテストからは分からず、ダッシュボードが「空」や「二重」になるか、費用が膨らんで初めて気づく種類の問題だから。

**How to apply:** 可観測性のプランでは、クエリ案にこれらを反映する。新しいフィールドや次元を使うときは、infra の Claude に依頼して dev の実データ（`aws/spans` の生 JSON、`list-metrics`）を先に見る。関連: [[reference-infra-monitoring-and-iam-layers]]
