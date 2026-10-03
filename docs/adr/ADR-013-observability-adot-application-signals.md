# ADR-013: backend の可観測性は ADOT（OpenTelemetry）で計装し、CloudWatch（Application Signals・Transaction Search）で見る

## 日付

2026-10-04（初版、SS-177）

## ステータス

採用（SS-177 で決定）。実装は SS-176 の子課題（SS-178 トレース計装 / SS-179 メトリクス / SS-180 ログの構造化 / SS-181 操作経路）で行う。
初版時点では計装コードも infra の変更も入っておらず、本 ADR の「要検証」の項目は dev で確かめていない。

## コンテキスト

backend の可観測性を強化したい（エピック SS-176）。やりたいことは次の 4 つ。

- API がどの程度呼ばれ、どのくらい時間が掛かり、どのくらいメモリを使っているかの傾向を、API（ルート）単位で把握する
- 問題がある場合に、それがどの API のどの部分（DB クエリ・外部 API・S3 など）かを把握する
- エラーをきっかけに、そのユーザーがどの操作を経由してきたかを辿る
- エラーログをトレースと紐付け、構造化（JSON）して検索しやすくする

登録時点の現状と制約は次のとおり。

- backend は FastAPI を Mangum 経由で Lambda（`python3.12` / zip / x86_64 / 1024MB / Timeout 29 秒）に載せ、Function URL + CloudFront で公開している（[ADR-005](./ADR-005-backend-serverless-deployment-lambda-function-url.md)）。Lambda は VPC 外で、外向き通信の制約は無い。
- ログは `core/observability.py` の `AccessLogMiddleware` が 1 リクエスト 1 行のプレーンテキスト（`method path -> status (N.Nms)`）を出すだけ。トレース・カスタムメトリクスは未導入。
- Lambda 固有のコードは `aws_lambda/` に閉じる（ADR-005 決定3。ECS への移行を見据えた制約）。
- 秘密は Secrets Manager（または SSM SecureString）に置き、実行ロールで読む。値を環境変数やテンプレートに焼かない（[ADR-004](./ADR-004-secrets-management-and-cicd-aws-credentials.md)）。
- Lambda の実行ロールの権限の上限は、sanposcape-infra の `sanposcape-<env>-lambda-boundary` が決める。SAM のデプロイロール（`sanposcape-<env>-sam-deploy`）は、作れるリソースを名前で絞っている。
- dev の AWS アカウントは他プロジェクトと共有している。prod は sanposcape 専用のアカウント。
- AWS X-Ray SDK / Daemon は 2026-02-25 にメンテナンスモードに入り、2027-02-25 にサポートが終わる。AWS は OpenTelemetry（ADOT）への移行を推奨している。

エピックの起票時点では「メトリクスを外部サービスでも閲覧したいので、可能なら OpenTelemetry を使う」としていた。SS-177 では Grafana Cloud への送信も検討したが、最終的に CloudWatch で見る方針に変えた（「検討した選択肢」を参照）。

## 決定

### 決定1: 計装は OpenTelemetry。Lambda では ADOT の `AWSOpenTelemetryDistroPython` レイヤーを使う

- レイヤー: `arn:aws:lambda:ap-southeast-1:615299751070:layer:AWSOpenTelemetryDistroPython:<version>`（初版時点の最新は v28。2026-10-01 公開、python3.10〜3.14、x86_64 / arm64 対応）。バージョンは template.yaml で固定し、上げるときは dev で確認してから prod へ出す。
- `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-instrument` で起動する。レイヤーはコレクターを含まず、プロセス内の SDK が Lambda 内の X-Ray エンドポイントへ UDP で送る。
- **Lambda の Active Tracing（`Tracing: Active`）を有効にする。** AWS の手順では任意（推奨）だが、Lambda サービス自身の区間（Init / Invocation / Overhead）を同じトレースに入れるために有効にする。
- 対象は API の関数（`ApiFunction`）だけ。マイグレーション用の関数には付けない（template.yaml の `Globals` には置かない）。
- `OTEL_SERVICE_NAME` は `sanposcape-backend-api`。`OTEL_RESOURCE_ATTRIBUTES` に次の 2 つを付ける。
  - `deployment.environment=<env>`: 共有の dev アカウントでも、他プロジェクトと区別できるようにする。
  - `aws.log.group.names=<API 関数のロググループ>`: Application Signals でトレースとログを紐付けるため（tasche と同じ）。
- **有効にする計装は明示的に列挙する。** レイヤーは既定で多くの計装（sqlalchemy / httpx / requests / logging など）を無効にしている。`OTEL_PYTHON_DISABLED_INSTRUMENTATIONS` を上書きすると、これらが一斉に有効になる。その結果、コールドスタートが延び、logging 計装が既存のログ設定と衝突する恐れがある。使うもの（FastAPI はアプリ側で手動、SQLAlchemy・botocore・httpx は自動）だけを有効にし、残りは無効のままにする。具体的な値は SS-178 で決める。
- **flush とレイテンシ**: ADOT の Lambda 計装は、呼び出しごとにレスポンスの前で同期的に flush する。送信先は同じ環境内の UDP エンドポイントなので、外部 SaaS へ HTTPS で送るより小さい見込みだが、実測はしていない。UDP のサイズ上限を超えるとバッチごと落ちるという既知の issue（aws-otel-python-instrumentation#915、未確認）もある。flush の時間とスパンの欠落の有無を、SS-178 で dev 実測する。
- アプリのコードが依存してよいのは、OpenTelemetry の API と計装ライブラリまで。ADOT 固有の API には依存しない（ECS などへ移っても、計装コードをそのまま使えるようにするため）。
- **zip とレイヤーのパッケージ衝突に注意する。** Lambda の `sys.path` では、zip（`/var/task`）がレイヤー（`/opt/python`）より前に来る。zip に同梱した `opentelemetry-*` が、レイヤーの SDK やディストロを上書きしてバージョンが食い違う恐れがある。どのパッケージをどちらに持たせるかは SS-178 で決め、依存が重複していないかと展開後のサイズ（レイヤー込みで上限 250MB）を確認する。
- X-Ray SDK と、Powertools for AWS Lambda の Tracer（X-Ray SDK ベース）は使わない。

### 決定2: 閲覧先は CloudWatch。トレースは Transaction Search、ルート単位のメトリクスは Application Signals

- **トレース**: Transaction Search で、スパンを `aws/spans` ロググループに取り込む。Active Tracing により、Lambda サービス自身が作る区間（Init / Invocation / Overhead）も同じトレースに入る。サンプリングされた呼び出しでは、コールドスタートがトレース上で見える（全件の集計は、下の REPORT 行で行う）。
- **ルート単位のメトリクス（呼び出し数・レイテンシ・エラー率）**: Application Signals が、スパンから操作（operation）ごとに自動で集計する。`OTEL_AWS_APPLICATION_SIGNALS_ENABLED=true`。実行ロールには、AWS の手順どおり管理ポリシー `CloudWatchLambdaApplicationSignalsExecutionRolePolicy` を付ける。
  - **操作名は「HTTP メソッド + ルートテンプレート」（例: `GET /pins/{pin_id}`）にする。** パスそのものを使うと、ID ごとに別の操作になってしまう。
  - 自動の FastAPI 計装（`fastapi` / `starlette` / `asgi`）は止め、アプリ側で `FastAPIInstrumentor.instrument_app` を呼ぶ。そのフックで、スパン名と `aws.local.operation` を上の形に書き換える。社内の前例（tasche）と同じ方法。
  - **ただし、Mangum 構成でこの方法が効くかは要検証。** tasche は Lambda Web Adapter + コンテナイメージ構成（tasche の ADR-005）で、FastAPI は uvicorn 上で動き、Lambda のハンドラーには包まれていない。sanposcape では、ADOT の Lambda 計装が Mangum のハンドラーを包んで SERVER スパンを作り、FastAPI のスパンはその子になる。Application Signals が集計する SERVER スパン（関数名ベース）に、子スパンの書き換えが反映されない可能性がある。効かない場合の代わりの手は、次の 2 つ。
    - フックで親（Lambda のハンドラー）のスパンの名前と `aws.local.operation` を書き換える
    - Lambda 計装を外す（X-Ray の Lambda 区間とのつながりなど、失うものを評価してから）
  - SS-178 で dev 実測して方式を決める。
- **メモリ・コールドスタート時間・タイムアウト**: Lambda が CloudWatch に標準で出すもの（REPORT 行の `Init Duration` / `Max Memory Used`、標準メトリクスの `Errors` / `Throttles` / `Duration` など）を使う。これらの値は、Lambda が関数の外で記録するので、関数内の計装や flush には頼らない。
  - 一方、**アプリのスパン**は関数内で flush するので、タイムアウトや OOM で強制終了された呼び出しでは失われる。その場合は REPORT 行と標準メトリクスで追う。
  - SS-180 で Lambda の `LoggingConfig` を JSON にすると、REPORT 行は `platform.report` 形式の JSON に変わり、Logs Insights の `@initDuration` などの自動フィールドが使えなくなる可能性がある（未確認）。SS-180 で確認し、集計クエリを合わせる。
  - Lambda Insights（約 $2.40/関数/月）は当面入れない。REPORT 行の Logs Insights 集計で足りなくなったら検討する。
- **カスタムメトリクス**（散歩の記録数などの業務指標）が要るときは EMF（構造化ログに埋め込み、CloudWatch メトリクスにする方式）を使う。`cloudwatch:PutMetricData` の権限は足さない。
- ダッシュボードとアラームの置き場（infra 層か services 層か）は SS-179 で決める。

### 決定3: ログは CloudWatch Logs に JSON で出し、trace_id で紐付ける

- アプリのログは、これまでどおり Lambda のロググループ（SAM 所有、保持 prod 400 日 / dev 30 日）に出す。外部への転送や二重保管はしない。
- ログは JSON にし、`trace_id` / `span_id` を付ける。トレースからログ、ログからトレースへ辿れるようにする。出力形式（Lambda の `LoggingConfig` を使うか、アプリのフォーマッターで出すか）と項目の詳細は SS-180 で決める。
- サンプリングでトレースが落ちても、ログは全件残す。エラー調査の最後の拠り所はログとする。

### 決定4: サンプリングは「全件」を目標にする

- 今の規模なら、全件取り込んでもコストは月 $0〜数ドルに収まる見込み。参考までに、dev アカウント全体（他プロジェクトを含む）の実績は、30 日で約 8.3 万スパンをインデックス化 100% で取り込み、2026-09 の請求は Application Signals $0.034、X-Ray のインデックス化 $0.034 だった。
- Active Tracing 側のサンプリング（毎秒 1 件 + 5% の固定）と、Transaction Search での取り込みの関係（サンプリングされなかった呼び出しのスパンが `aws/spans` に入るか）は、SS-178 で dev 実測して確定する。全件にならない場合でも、決定3 によりログは全件残る。
- テイルサンプリング（エラーのトレースだけ残す、など）は、Lambda 内では実質的に使えないので採らない。量が増えたら、ヘッドサンプリング（`parentbased_traceidratio`）を検討する。

### 決定5: Transaction Search / Application Signals のアカウント設定

| | dev（共有アカウント） | prod（専用アカウント） |
|---|---|---|
| 有効化 | **2026-05 に有効化済み（利用しているのは他プロジェクトの chase-light / tasche。誰が有効化したかは CloudTrail の保持期間外で追えない）。sanposcape は相乗りする**。sanposcape-infra では管理しない（共有アカウントにシングルトンを作らない、という sanposcape-infra ADR-0001 §2.8 に従う） | sanposcape-infra の `live/account` で Terraform 管理する（`dedicated_account` のときだけ作る） |
| インデックス化の割合 | 100%（他プロジェクトの設定） | **100%** |
| `aws/spans` の保持 | 30 日（他プロジェクトの設定） | **90 日** |
| `/aws/application-signals/data` の保持 | 無期限（他プロジェクトの設定） | **90 日** |

- dev は他プロジェクトが管理する設定に依存する。無効化や割合の変更があると、sanposcape の dev での見え方も変わる。
- アプリのログ（400 日）より短くするのは、スパンが量のわりに調査で使う期間が短いため。長期の傾向は Application Signals のメトリクスで見る。

### 決定6: 外部へ出してよい情報のルール

スパン属性・ログ・メトリクスの次元（ディメンション）に、次の情報を載せない。

- **クエリ文字列**: `GET /pins` などのクエリには位置情報の矩形や検索語が入る。OTel の HTTP 計装は既定で URL 全体（クエリを含む）を属性に入れるため、フックでクエリを除いた値に置き換える。
- **ヘッダー・リクエスト / レスポンスのボディ**: アクセストークン（`X-App-Authorization`）や、位置情報・メモなどのユーザーデータが入るため。ヘッダーを属性に入れる設定（`OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_*`）は使わない。
- **位置情報**（緯度経度・軌跡）、メールアドレス・氏名などの個人情報
- **秘密**（トークン・API キー・署名付き URL）
- **SQL のバインド値**: SQLAlchemy の計装はプレースホルダ付きの SQL 文だけを記録する。バインド値を記録する設定は使わない。
- **例外のメッセージ経由の漏れ**: スパンの例外イベント（`exception.message` / スタックトレース）やエラーログは、上のルールの抜け道になる。たとえば SQLAlchemy の `DBAPIError` は文字列化すると `[parameters: ...]` としてバインド値を含み、psycopg のエラー詳細にも値が出る。SQLAlchemy の `hide_parameters=True` などの対策を SS-178 / SS-180 で入れる。

ユーザーを識別する必要がある場合（SS-181）は、内部のユーザー ID だけを使う。`AccessLogMiddleware` の「パスに秘密を載せるルートを足すときは、除外またはマスクを検討する」という注意は、スパンの属性（`url.path`）にもそのまま当てはまる。

なお、CloudFront が `traceparent` / `X-Amzn-Trace-Id` をオリジンへ転送するかは未確認。今は mobile からトレースを繋がないので問題ないが、将来つなぐときに確認する。

### 決定7: コードの置き場所（ADR-005 決定3 との整合）

- 実行環境に依存しない部分（`FastAPIInstrumentor` の呼び出し、操作名とクエリ除去のフック、ログのフォーマット）は `core/observability.py` に置く。
- Lambda 固有の部分（レイヤー・`AWS_LAMBDA_EXEC_WRAPPER`・`Tracing: Active`・`OTEL_*` の環境変数）は `template.yaml` に置き、アプリのコードには持ち込まない。`aws_lambda/` に手を入れる必要が出た場合も、そこに閉じる。
- **TracerProvider などの初期化と終了を FastAPI の lifespan に置かない。** Mangum の `lifespan="auto"` は、Lambda の呼び出しごとに startup / shutdown を走らせている疑いがある（SS-183）。
- **TracerProvider を作るのは、アプリのコードではなく起動ラッパー。** Lambda ではレイヤーの `otel-instrument` が起動時に 1 回だけ作る。ローカルや将来の ECS でも、同じように起動側（`opentelemetry-instrument` での起動など）が作る。`core/observability.py` は、既に構成されているプロバイダーを使うだけで、自分では構成しない（Lambda で二重に構成しないため）。この方針で無理がある場合は、SS-178 で見直して追補する。

### 決定8: ローカル（docker compose）と自動テスト

- ローカルでは ADOT レイヤーを使わず、同じ計装コードから OTLP で手元のトレースビューアに送る。次の点は SS-178 で決める。
  - ビューアの選定（Jaeger v2 / `grafana/otel-lgtm` など）
  - compose への組み込み方（profile にして、既定では起動しない、など）
  - ローカル用の SDK と exporter を、dev 用の依存にするかどうか
- 計装を有効にしない場合（既定）は何もしない（no-op）。pytest では、計装を無効にするか InMemory のエクスポーターでスパンを検証する。

## 検討した選択肢

### 選択肢1: アプリ内の OTel SDK から、外部 SaaS（Grafana Cloud など）へ OTLP で直接送る

- **概要**: SDK から OTLP/HTTP で SaaS に送り、呼び出しごとにレスポンスの前で flush する。
- **メリット**: レイヤーも infra の変更もほぼ要らない。SaaS の UI は使いやすい。ベンダーを切り替えやすい。
- **デメリット**:
  - Lambda の計測値（Init Duration・Max Memory Used・タイムアウト / OOM の記録）は拡張しか受け取れないので、OTel 側に出ない。
  - タイムアウトや OOM のときは flush が走らず、その呼び出しのスパンが失われる。
  - flush の時間（外部への HTTPS の往復）がレスポンスに乗る。
  - SaaS の API キーが増える（SDK をコードで構成すれば、既存のハイドレーションの後に読める）。

### 選択肢2: OTel のコレクター拡張（upstream の opentelemetry-lambda）経由で外部 SaaS へ送る

- **概要**: SDK から localhost のコレクター拡張へ送り、拡張が SaaS へ転送する。telemetryapi receiver で Lambda の計測値も取る。
- **メリット**: 選択肢1 の死角（Init Duration・メモリ・タイムアウト）を埋められる。API キーは拡張が Secrets Manager から読める。クエリ除去などの加工を 1 か所にまとめられる。
- **デメリット**:
  - telemetryapi receiver と、レスポンスを待たせないための decouple processor は、どちらも alpha。
  - decouple を使わないと、送信時間はレスポンスに乗る（直接送るのと同程度）。
  - レイヤーの許可（infra）が要る。ADR-008 で拡張を避けた前例とも食い違う。
  - 無料枠での保持が短い（検討した Grafana Cloud は 14 日）。

### 選択肢3: ADOT のレイヤーから外部 SaaS へ送る

- **概要**: `AWSOpenTelemetryDistroPython` の送信先を SaaS の OTLP エンドポイントに変える。
- **メリット**: 計装の大半を自動でやってくれる。
- **デメリット**:
  - コレクターを含まないので、死角は選択肢1 と同じ。
  - SDK はアプリの import より前にラッパーが構成するので、既存のハイドレーションでは API キーを渡せない。環境変数に値を書くしかなく、ADR-004 に反する。
  - ADOT の付加価値（X-Ray・Application Signals 連携）が活きない。
  - コレクター同梱の旧 ADOT レイヤーは公式に「推奨しない（legacy）」とされ、processor を持たず、Secrets Manager から値を読む機能も削られている。

### 選択肢4（採用）: ADOT レイヤー + Active Tracing + Application Signals + Transaction Search（CloudWatch）

- **概要**: 決定1〜5 のとおり。
- **メリット**:
  - Lambda の計測値・Init 区間・タイムアウトを Lambda / X-Ray が自分で記録するので、関数内の flush に依存しない。
  - IAM で認証するので、秘密が要らない。
  - ルート単位の RED メトリクス（呼び出し数・エラー率・レイテンシ）を Application Signals が自動で出す。
  - ログ・トレース・メトリクスが同じリージョンの CloudWatch に集まる。
  - dev は有効化済みの設定に相乗りでき、社内に前例（tasche）がある。
- **デメリット**:
  - infra 側の作業が最も多い（「移行・対応が必要な事項」を参照）。
  - トレース調査の画面やダッシュボードは、SaaS より使いにくい。
  - dev は他プロジェクトの設定に依存し、dev のコストは `Project` タグで切り出せない。

### 選択肢5: X-Ray SDK / Powertools Tracer

- **概要**: 従来の X-Ray SDK で計装する。
- **デメリット**: 2027-02-25 にサポートが終わる。OpenTelemetry への移行が推奨されている。

## 決定理由

- **見えなくなるものを作らない**ことを最も重く見た。Lambda では、コールドスタート・メモリ・タイムアウトといったプラットフォーム側の情報が、関数内の計装からは取れない。CloudWatch では Lambda 自身がこれらを記録し、Active Tracing でトレースにも入る（サンプリングされた呼び出し）。
- **秘密を増やさない。** 外部 SaaS は API キーが必須で、ADR-004 に沿って渡す手段が限られる（選択肢3 では実質的に無い）。CloudWatch は実行ロールの IAM で足りる。
- **alpha の部品に依存しない。** 選択肢2 で死角を埋めるには、alpha の telemetryapi receiver が要る。
- **dev 共有アカウントの懸念が実測で解消した。** dev では Transaction Search と Application Signals が既に有効で、相乗りするだけで済む。prod は専用アカウントなので、自分たちで有効化できる。
- **コストはどの選択肢でも月 $0〜数ドル**で、判断の決め手にならなかった。dev の実績（2026-09）は、アカウント全体で Application Signals $0.034、X-Ray のインデックス化 $0.034。
- 起票時の「外部サービスでも見たい」は、手段として OpenTelemetry を選ぶ理由だった。計装は OpenTelemetry のまま（決定1）なので、将来 SaaS へ送りたくなった場合も、計装コードは作り直さずに済む。

## 影響

### ポジティブな影響

- API ごと・処理ごと（DB・S3・外部 API）の時間とエラーが、トレースとメトリクスで見えるようになる。
- 計装は OpenTelemetry の API に寄せるので、ECS への移行や送信先の変更に耐える。
- 秘密の追加も、外部への新しい通信経路も無い。

### ネガティブな影響・トレードオフ

- ADOT レイヤー（圧縮で約 14MB）と計装の分だけ、コールドスタートが延びる。どの程度かは、SS-178 で `Init Duration` の変化を dev で実測する。
- ADR-008 では「デプロイロールの変更を不要にする」ために AppConfig の Lambda Extension を避けた。今回はレイヤーの許可のためにデプロイロールを変える。ADOT の新しいレイヤーは常駐プロセス（拡張）を持たないので、テストのしやすさという ADR-008 のもう 1 つの理由には当たらない。それでもデプロイロールの変更は伴う。
- dev は他プロジェクトの設定に依存する。dev の X-Ray / Application Signals のコストは `Project=sanposcape` タグで切り出せず、予算アラートに乗らない（実額は月数セント）。
- CloudWatch の画面は、SaaS に比べてトレースを横断的に調べにくい。

### 移行・対応が必要な事項

**infra（sanposcape-infra、`live/account`）**: 1〜2 本の PR。dev で IAM を先に入れ、アプリ側で dev にデプロイして確かめてから prod に適用する。

1. `sam_deploy.tf`: `lambda:GetLayerVersion` を、`arn:aws:lambda:ap-southeast-1:615299751070:layer:AWSOpenTelemetryDistroPython:*` に限って許可する（dev・prod）。
2. `sam_deploy.tf`: `ReadAttachedManagedPolicies` に `AWSXrayWriteOnlyAccess`（`Tracing: Active` で SAM が自動でアタッチする）と `CloudWatchLambdaApplicationSignalsExecutionRolePolicy`（決定2）を足す（dev・prod）。
3. `lambda_boundary.tf`: `xray:GetSamplingRules` / `GetSamplingTargets`（使う場合）と、`/aws/application-signals/data:*` への `logs:CreateLogStream` / `PutLogEvents` を足す（dev・prod）。後者が実行ロールに本当に要るか（X-Ray がリソースポリシー経由で書いている可能性がある）は、dev で確かめて、要らなければ削る。
4. 新しい `observability.tf`（prod のみ）: X-Ray から `aws/spans` と `/aws/application-signals/data` への書き込みを許すリソースポリシー、トレースセグメントの送信先（`CloudWatchLogs`）、インデックス化ルール（100%）、2 つのロググループ（保持 90 日）、Application Signals のサービスリンクロール。次の 2 点は、適用前に infra 側で確認する。
   - ロググループを先に作ってから送信先を切り替える順序で、衝突しないか
   - サービスリンクロールを `aws_iam_service_linked_role` で作れるか
5. dev が他プロジェクトの設定に依存していることを、`live/account/README.md` と ADR-0001 に記録する。

**backend（後続の子課題）**

- SS-178: レイヤー・`Tracing: Active`・`OTEL_*` の環境変数を `template.yaml` に追加する。`core/observability.py` に計装とフック（操作名・クエリ除去）を置く。ローカルのトレースビューアを用意する。dev で次を実測する。
  - コールドスタートの増え方（`Init Duration` の変化）
  - flush の時間と、UDP 送信でのスパンの欠落
  - サンプリングと Transaction Search の取り込みの関係
  - Mangum 構成で操作名がルート単位になるか
  - zip とレイヤーの依存の重複・展開後のサイズ
- SS-179: Application Signals と Lambda の標準メトリクス・REPORT 行を使ったダッシュボード。必要ならアラーム。
- SS-180: ログの JSON 化と `trace_id` の付与。
- SS-181: ユーザー ID（内部 ID のみ）を span・ログに付け、エラーから操作経路を辿る手順を文書化する。
- SS-183: Mangum の lifespan の件（決定7 の前提）。

## 関連情報

- エピック SS-176、本課題 SS-177、後続 SS-178 / SS-179 / SS-180 / SS-181 / SS-183
- [ADR-004](./ADR-004-secrets-management-and-cicd-aws-credentials.md)（秘密の扱い）、[ADR-005](./ADR-005-backend-serverless-deployment-lambda-function-url.md)（Lambda の構成と決定3）、[ADR-008](./ADR-008-deploy-release-separation.md)（Lambda Extension を避けた前例）
- sanposcape-infra: `live/account/lambda_boundary.tf` / `sam_deploy.tf`、ADR-0001 §2.8（共有アカウントでシングルトンを作らない）・§2.10（秘密の置き場）
- 社内の前例: tasche の `packages/backend/infra/template.yaml`（ADOT + Application Signals）、`packages/backend/src/tasche/main.py`（`aws.local.operation` の上書き）、`docs/adr/ADR-005-backend-lambda-packaging.md`（Lambda Web Adapter + コンテナイメージ構成）
- AWS: [Application Signals on Lambda](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Application-Signals-Enable-LambdaMain.html) / [Transaction Search](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Transaction-Search.html) / [ADOT Lambda](https://aws-otel.github.io/docs/getting-started/lambda/) / [Lambda と X-Ray](https://docs.aws.amazon.com/lambda/latest/dg/services-xray.html) / [X-Ray SDK のサポート終了](https://docs.aws.amazon.com/xray/latest/devguide/xray-daemon-eos.html)
