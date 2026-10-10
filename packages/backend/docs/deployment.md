# backend デプロイ手順（AWS SAM）

`packages/backend` を AWS Lambda（zip + `python3.12`）+ Lambda Function URL（`AuthType=AWS_IAM`）に
載せ、AWS SAM で dev / prod の AWS アカウントへデプロイする手順。方式決定の背景・却下案は
[ADR-005](../../../docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md) を参照。

> **デプロイ ≠ リリース。** 本ドキュメントが扱うのは「コードを本番環境に置く」ところまでである。
> 「利用者に機能を見せる」のはフィーチャーフラグの ON（および mobile ではストアの公開）であり、
> 別の操作として扱う（[ADR-008](../../../docs/adr/ADR-008-deploy-release-separation.md)）。
> リリース全体の流れ・フラグの操作・引き返し方は
> [docs/release-runbook.md](../../../docs/release-runbook.md) を参照。

> **検証状況（最終更新 2026-10-05）**
>
> | 手順 | 状況 |
> |---|---|
> | `sam validate --lint` | ✅ 検証済み |
> | `make lambda-requirements` → `sam build --use-container` | ✅ 検証済み（成果物 88MB。`psycopg_binary` の manylinux `.so` と `.env` 非混入も確認） |
> | `sam deploy --config-env dev` | ✅ 検証済み（dev スタック `CREATE_COMPLETE`。契約値・タグ・ログ保持期間まで確認） |
> | `aws lambda invoke`（直接）で `/health` | ✅ 200 `{"status":"ok"}`。シークレット取得の実経路も通過 |
> | Function URL 直叩き | ✅ 403 `{"Message":"Forbidden"}` |
> | マイグレーション Lambda（§5.2） | ✅ 検証済み（`{"head": "ecd8f161fedb"}`。2 回目の invoke が no-op になる冪等性も確認） |
> | API 本体 → Neon（pooled）の疎通 | ✅ `GET /spots` が 200（検証当時。`spots` ドメインは SS-88 で削除済みで現存しないが、他のエンドポイントでも成り立つ結論として psycopg3 のプロトコルレベル prepared statement が Neon の PgBouncer で問題なく動くことを確認済み、§9） |
> | `sam local invoke`（§4 手順5） | ⚠️ **未検証**。`APP_SECRET_ARN` に各自の dev シークレット ARN を埋める必要がある |
> | CloudFront 経由（§6.2） | ✅ **dev は検証済み**（2026-09-12 / SS-81）。`/health` 200 に加え、**iOS 実機から認証必須エンドポイントとボディを伴う POST を実際に踏んで成功**した（下記）。prod は未実施 |
> | prod へのデプロイ | ⚠️ **未実施**。Lambda 同時実行数クォータの引き上げとシークレット値の投入が前提 |
> | 実行ロールへの Permission Boundary 付与（SS-72） | ⚠️ **未デプロイ**。`sam validate --lint` と SAM Transform 後に `ApiRole` / `MigrateRole` の両方へ境界が入ることは確認済み。dev への初回デプロイ（手元の管理者権限。§7 参照）が前提 |
> | GitHub Actions からのデプロイ（§4.1 / SS-72） | ⚠️ **未実施**。ワークフローは actionlint / zizmor を通過。`development` Environment の `AWS_SAM_DEPLOY_ROLE_ARN` 設定と上の初回デプロイが前提。prod は infra 側のデプロイロール・`lambda_boundary_arn` の apply（SS-97）待ち |
> | ピン写真バケット（S3）の結線（§12 / SS-108） | ✅ **dev は検証済み**（2026-09-24 / SS-88）。確認 1)〜3)（SSM・環境変数・実行ロールの `Resource` が完全な ARN に解決されていること）に加え、**ローカル backend（`STORAGE_MODE=real`）から dev の実バケット**へ写真付きピン登録を通し、`original/` と `thumb/` の生成・`staging/` の削除まで確認。⚠️ **デプロイ済み Lambda 経由での登録（手順 3〜4）は未実施**で、Lambda 実行ロールでの直送は再現していない（付与・境界の静的確認で代替）。**prod は未実施**（infra の prod apply 待ち） |
> | トレース（ADOT レイヤー・Active Tracing・OTEL_*。§13 / SS-178） | ✅ **dev で確認済み（2026-10-04）**。デプロイ成功（レイヤー参照・管理ポリシーのアタッチとも権限エラーなし）、`aws/spans` にスパンが入る、Application Signals の操作は `FunctionHandler` のみ、Lambda の親スパンにクエリ・User-Agent が残らない（イベント無害化の後）、Init Duration は約 +0.8 秒。**prod は infra の SS-185 の prod 適用までデプロイ不可** |
> | メトリクス・ダッシュボード・アラーム（§14 / SS-179） | ⚠️ **デプロイ未実施**（infra の `ManageBackendMonitoring`＝sanposcape-infra PR #53 の dev apply 待ち）。`sam validate --lint` と pytest（`test_monitoring_config.py`）は通過。**dev の読み取りで確認済み（2026-10-05、infra 経由）**: スパンのフィールド名と型、Q1 / Q2 の構文と実データでの集計、REPORT 行のクエリ、Application Signals の `Environment`＝`dev` と `Operation` を含む次元、関数単位の `ConcurrentExecutions`、SSM の通知先トピック（dev / prod とも存在・購読確認済み・SNS のポリシーは CloudWatch の Publish を許可）。**未確認**: ダッシュボードの全ウィジェットの描画、Q4（bin + name の折れ線）、Q7 のログ文言、`aws/spans` の件数と `Invocations` / Application Signals の `SampleCount(Latency)` の差（サンプリング）、デプロイそのもの。prod は ManageBackendMonitoring の prod 適用（SS-185 の prod 適用と同時期）待ち。**この行は dev へのデプロイと §14「デプロイ後の確認」を済ませたら ✅ に更新する（マージ前の完了条件）** |
> | ログの JSON 化（§15 / SS-180） | ⚠️ **デプロイ未実施**（dev へはデプロイしていない）。pytest・ローカル（compose）では確認済み。**未確認**: Lambda のロググループでアプリのログが JSON になること（ランタイムの root のハンドラーのフォーマッター差し替え）、Logs Insights が `level` / `trace_id` をフィールドとして見つけること、START / END / REPORT がテキストのままでダッシュボードの Q5〜Q6b が変わらないこと、ログ ⇔ トレースの往復（`trace_id` ⇔ `aws/spans` の `traceId`、コンソールの「ログ」欄の自動相関）、`aws_request_id` と REPORT 行の `@requestId` の一致、クエリ文字列がログに残らないこと。**この行は §15「デプロイ後の確認」を済ませたら ✅ に更新する** |
> | lifespan が実行環境ごとに 1 回（§6.1.1 / SS-183） | ⚠️ **未実施**（pytest の境界テストは通過。マージ後に dev で Logs Insights により確認する） |
> | production デプロイ後のタグ・Release 作成（§4.1 / SS-72） | ⚠️ **未実施**（prod デプロイ自体が未実施のため）。採番・リリースノート・スキップ条件は git-cliff 2.14.1 を手元の複製リポジトリで実行して確認済み |

## 1. 前提

- AWS CLI が設定済みで、dev / prod いずれかの AWS アカウントのクレデンシャルを
  `AWS_PROFILE` 等で切り替えられること。
- リージョンは **`ap-southeast-1`** 固定。
- Docker が利用可能であること（`sam build --use-container` が内部で使う）。
- ローカル開発用の `docker compose` 環境とは別物。デプロイ作業はホストで `sam` / `aws` CLI を
  直接実行する（`docker compose exec api ...` ではない）。
- **（SS-72）通常のデプロイは GitHub Actions（§4.1）から行う。** 手元からのデプロイは、初回の
  境界付与（§7）・CI が使えない場合の緊急時・changeset を目で確認したい場合に限る。
- `sanposcape-infra` の `live/account` が apply 済みで、次が存在すること（§3 Phase 0 で確認する）。
  - SSM `/sanposcape/<env>/account/lambda_boundary_arn`（実行ロールに付ける Permission Boundary の ARN）
  - GitHub Actions 用のデプロイロール（`sam_deploy_role_arn` の output）。**prod はどちらも未 apply（infra タスク SS-97 で対応予定）。prod の初回デプロイは SS-97 の完了待ち**
- （SS-179）デプロイロールの `ManageBackendMonitoring`（CloudWatch のダッシュボード・アラームの操作。sanposcape-infra PR #53）と、
  SSM `/sanposcape/<env>/platform/alerting/topic_arn`（アラームの通知先）。どちらも §3 Phase 0 で確認する。
  **dev に apply されるまで backend をマージしない**（次のデプロイが CloudWatch の AccessDenied で止まる）。
  prod は `ManageBackendMonitoring` が SS-185 の prod 適用と同じタイミング、トピックの SSM は prod にも存在する（2026-10-05 確認）

### dev / prod の対応表

| 項目 | dev | prod |
|---|---|---|
| SAM スタック名 | `sanposcape-backend-dev` | `sanposcape-backend-prod` |
| API 関数名 | `sanposcape-dev-backend-api` | `sanposcape-prod-backend-api` |
| マイグレーション関数名 | `sanposcape-dev-backend-migrate` | `sanposcape-prod-backend-migrate` |
| アプリの `ENV` | `staging` | `production` |
| ロググループ保持期間 | 30日 | 400日 |
| `ReservedConcurrentExecutions` | Api=5 / Migrate=1 | 未設定（後述） |
| API ドキュメント（`/docs`、SS-131） | 公開（Scalar、200） | 非公開（404） |

**`Env=dev` はアプリの `ENV=staging` に対応する。** `template.yaml` の `Mappings`
（`EnvToAppEnv`）で変換しており、`config.py` の `Literal["local","test","staging","production"]`
はこのために広げていない（[ADR-005 決定6](../../../docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md#6-アプリの-env-はテンプレートの-mappings-で変換し-configpy-の-literal-を広げない)）。
dev アカウントの CloudWatch Logs には `ENV=staging` と出る。

## 2. 責務境界

| 作るもの | 所有者 |
|---|---|
| Lambda 関数 2 つ（API 本体 / マイグレーション）、実行ロール、CloudWatch ロググループ 2 つ、API 本体の Function URL | **SAM**（このリポジトリ） |
| CloudWatch ダッシュボード 1 枚、ap-southeast-1 のアラーム（`sanposcape-<env>-backend-*`。§14 / SS-179） | **SAM**（このリポジトリ） |
| CloudFront ディストリビューション、WAF、Route53、ACM、OAC、Secrets Manager の器、アクセスログ S3、CloudFront のアラーム（us-east-1）、アラートの SNS トピック | **Terraform**（別リポジトリ `sanposcape-infra`） |
| CloudFront からの呼び出し許可（`lambda:InvokeFunctionUrl` / `lambda:InvokeFunction`） | **Terraform**（`enable_distribution = true` の apply 時に付与） |

**デプロイ順は常に SAM → Terraform。** SAM が Lambda 関数と Function URL を作った後でないと、
Terraform 側が CloudFront のオリジンとして参照できない。

> **Secrets Manager は「器」だけが Terraform 所有で、`SecretString` の中身は管理外**
> （2026-09-12 / SS-81 に確認）。手で `put-secret-value` した値は **Terraform の apply で
> 巻き戻らない**。`sanposcape-infra` 側で `terraform plan` を実行し、シークレット値を
> 手動更新した後でも `No changes` になることを確認済み。
>
> これを確認せずに値を入れると「apply のたびに設定が消えるのでは」という不安が残り、
> §5.1 の手順（`neon_dsn_unpooled` の投入など）を実行してよいかの判断が付かなくなる。
> **ただし infra 側の実装が変われば前提は崩れる**ので、値を管理する変更が入った疑いがあるときは
> 再確認すること。

## 3. 初回セットアップ

- `sam --version` で AWS SAM CLI が利用可能であることを確認する。
- Docker が起動していることを確認する。
- **`--use-container` は省略できない。** `psycopg[binary]` は manylinux のバイナリ wheel を
  含み、ビルドホストの arch / glibc に依存する。ホストで直接ビルドすると
  `Runtime.ImportModuleError: No module named 'psycopg_binary'` のような形で Lambda 実行時に
  初めて失敗する（ローカルでは再現しない）。`samconfig.toml` で `use_container = true` を
  既定にしているが、コマンドラインで明示する場合も必ず付ける。

### Phase 0: デプロイ前の確認（AWS へは書き込まない）

```bash
# SSM パラメータ（シークレットの ARN）が存在すること
aws ssm get-parameter --name /sanposcape/dev/platform/secrets/shared/arn --region ap-southeast-1

# 実行ロール用 Permission Boundary の ARN が存在すること（SS-72。無いと deploy 時の
# {{resolve:ssm:}} が失敗する。infra の live/account が未 apply の環境では存在しない）
aws ssm get-parameter --name /sanposcape/dev/account/lambda_boundary_arn --region ap-southeast-1

# AppConfig（フィーチャーフラグ、SS-94/ADR-008）の ID が3本とも存在すること。
# 1本でも欠けると template.yaml の {{resolve:ssm:}} が解決できず、deploy 自体が失敗する
# （backend が読むのは application_id / environment_id / configuration_profile_id の3本。
# deployment_strategy_id は SS-99 のワークフロー側が読む）
aws ssm get-parameter --name /sanposcape/dev/platform/appconfig/application_id --region ap-southeast-1
aws ssm get-parameter --name /sanposcape/dev/platform/appconfig/environment_id --region ap-southeast-1
aws ssm get-parameter --name /sanposcape/dev/platform/appconfig/configuration_profile_id --region ap-southeast-1

# ピン写真バケット（SS-106/SS-108, §12）の名前と ARN が存在すること。
# 無いと template.yaml の {{resolve:ssm:}} が解決できず、deploy 自体が失敗する
aws ssm get-parameter --name /sanposcape/dev/platform/pin_photos/bucket_name --region ap-southeast-1
aws ssm get-parameter --name /sanposcape/dev/platform/pin_photos/bucket_arn --region ap-southeast-1

# シークレットのキー名だけを確認する（値は絶対に出さない）
aws secretsmanager get-secret-value --secret-id <上記で得たARN> \
  --query SecretString --output text | python3 -c "import sys,json; print(*sorted(json.load(sys.stdin)), sep='\n')"
# → neon_dsn / neon_dsn_unpooled / jwt_signing_key / google_oauth_client_id /
#   google_maps_server_api_key が揃っていること（google_oauth_client_secret は未使用）

# 同名のロググループが既に存在しないこと（存在すると明示定義が CREATE_FAILED になる）
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/sanposcape-dev-backend \
  --region ap-southeast-1

# （SS-178）ADOT レイヤーを参照できること（デプロイロールに lambda:GetLayerVersion が要る。
# infra の SS-185。無いと deploy 時に Api 関数の作成が失敗する）。prod は SS-185 の prod 適用後に確認する
aws lambda get-layer-version-by-arn --region ap-southeast-1 \
  --arn arn:aws:lambda:ap-southeast-1:615299751070:layer:AWSOpenTelemetryDistroPython:28 \
  --query '{Version:Version,Size:Content.CodeSize}'

# （SS-179）アラートの通知先（SNS トピック）の ARN が存在すること。無いとアラームの
# {{resolve:ssm:}} が解決できず deploy が失敗する（infra の live/platform が未 apply の環境には無い）
aws ssm get-parameter --name /sanposcape/dev/platform/alerting/topic_arn \
  --region ap-southeast-1 --query 'Parameter.Value' --output text

# （SS-179）デプロイロールにダッシュボード・アラームの許可があること
# （infra の ManageBackendMonitoring。sanposcape-infra PR #53。無いと deploy が CloudWatch の AccessDenied で止まる。
# DescribeAlarms は Resource "*" の別 statement（Sid DescribeAlarms）なので、あわせて確認する）
aws iam get-role-policy --role-name sanposcape-dev-sam-deploy --policy-name sam-deploy \
  --query 'PolicyDocument.Statement[?Sid==`ManageBackendMonitoring` || Sid==`DescribeAlarms`]'
```

## 4. デプロイ手順

`packages/backend` 直下で実行する。

```bash
cd packages/backend

# 1) requirements-lambda.txt を生成する（ビルドコンテナに uv が無いため、ここだけホストで行う）
make lambda-requirements

# 2) テンプレートの静的検証（sam CLI が使える環境で行うこと。本セッションでは未実行）
sam validate --lint

# 3) ビルド（--use-container 必須。Makefile の build-Api / build-Migrate が呼ばれる）
sam build --use-container

# 4) 展開後サイズの確認（250MB 制限に対する余裕。uvicorn[standard] を含むため要注意。
#    制限は**レイヤー込み**（zip + ADOT レイヤー。§13）の合計なので、ここの値にレイヤー分を足して見る）
du -sh .aws-sam/build/Api

# 5) ローカルでの疎通確認（任意。dev の有効な AWS 認証情報が必要。下の注記を参照）
sam local invoke Api --event events/health-get.json --env-vars events/local-env.json

# 6) dev へデプロイ
sam deploy --config-env dev
```

> **`sam local invoke --env-vars` は `template.yaml` の `Environment.Variables` に
> 宣言済みの変数しか上書きできない。** 未宣言のキーを `--env-vars` の JSON に書いても
> **黙って無視される**（エラーにならないため気づきにくい）。`--container-env-vars`
> も試したが、通常の `invoke`（デバッグセッションではない）には注入されない。
>
> `template.yaml` が宣言しているのは、Globals の `ENV` / `AUTH_MODE` / `MAPS_MODE` /
> `FEATURE_FLAG_MODE` / `STORAGE_MODE` / `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` /
> `DB_POOL_RECYCLE_SECONDS` / `APP_SECRET_ARN` の 9 つと、`Api` 関数だけが持つ
> `APPCONFIG_APPLICATION_ID` / `APPCONFIG_ENVIRONMENT_ID` / `APPCONFIG_CONFIGURATION_PROFILE_ID` /
> `PIN_PHOTO_BUCKET_NAME` の 4 本、トレース関連の 8 本（`TRACING_ENABLED` /
> `AWS_LAMBDA_EXEC_WRAPPER` / `OTEL_*`。§13）で、`Api` は計 21 本（`Migrate` は Globals の 9 本）。
> `Api` の `AWS_LAMBDA_EXEC_WRAPPER` と `Layers` は `sam local invoke` でも有効になり、ADOT レイヤーの
> 取得（`lambda:GetLayerVersion`）を試みる。ローカルで外したいときは `--env-vars` で
> `AWS_LAMBDA_EXEC_WRAPPER` と `TRACING_ENABLED` を空にする。
> `AUTH_JWT_SECRET` や `DATABASE_DSN` のような未宣言の変数を `events/local-env.json` に
> 書いても効かず、`ENV=staging` の起動時バリデーションが
> `AUTH_JWT_SECRET must be set (>=32 chars) when ENV=staging` のようなエラーで失敗する。
>
> **対処**: 宣言済みの `APP_SECRET_ARN` に dev の実シークレット ARN を指定し、
> `hydrate_environment_from_secret()` の実経路（デプロイ後と同じ経路）を通して値を取得させる。
> これには **dev の有効な AWS 認証情報が必要**（`aws sts get-caller-identity` で確認できる）。
> `events/local-env.json` の `APP_SECRET_ARN` はプレースホルダになっているので、
> 各自の dev シークレット ARN に書き換えてから実行すること。**実 ARN はコミットしない**
> （このリポジトリは public で、ARN に AWS アカウント ID が含まれるため）。

- `samconfig.toml` の `[dev.deploy.parameters]` にスタック名・リージョン・タグを固定しているため、
  `--config-env dev` だけで完結する。`parameter_overrides = "Env=dev"` がテンプレートの `Env`
  パラメータに渡る。
- prod へのデプロイも同様に `sam deploy --config-env prod` だが、**prod は Lambda の同時実行数
  クォータが引き上げ承認されるまでデプロイしない**（§9「Neon 接続設定」の下、および
  ADR-005 決定8を参照）。加えて prod のシークレットに値が未投入の間は Lambda が起動時に
  `ResourceNotFoundException` で落ちる。

### 4.1 GitHub Actions からのデプロイ（SS-72）

ワークフローは `.github/workflows/backend-deploy.yml`。認証は OIDC で、GitHub に長期クレデンシャルは
置かない（[ADR-004 決定5・6](../../../docs/adr/ADR-004-secrets-management-and-cicd-aws-credentials.md)）。

#### トリガー

| 環境 | 起動方法 | ゲート |
|---|---|---|
| dev（`development` Environment） | 手動実行のみ（`environment: development`）。**任意のブランチ / ref から起動できる** | backend CI（lint / test / マイグレーションのスモーク）の通過 |
| prod（`production` Environment） | 手動実行のみ（`environment: production`） | backend CI の通過 + **main からの実行のみ** + **Required reviewers（tri-star）の承認** |

- **main への push による自動デプロイはしない**（SS-72 の途中で方針変更）。dev・prod とも、書き込み権限を
  持つ人が Actions 画面または `gh` で明示的に起動する。
  ```bash
  gh workflow run backend-deploy.yml -f environment=development --ref <branch>
  gh workflow run backend-deploy.yml -f environment=production --ref main
  ```
- 同じ環境へのデプロイは実行単位（ビルド・リリース作成を含む）で直列化される（取り消さない。
  待機中の実行は新しい実行に置き換わる）。
- dev は任意の ref から起動できるため、別々のブランチを続けてデプロイすると後に起動したものが残る。
  検証中のブランチを dev に出したまま放置しないこと（main を再デプロイして戻す）。

#### job 構成

`prepare`（デプロイ先の決定・prod の ref チェック）→ `ci`（backend CI を呼び出す）→
`build`（`make lambda-requirements` → `sam validate --lint` → `sam build --use-container`）→
`deploy`（Environment に入り OIDC で AssumeRole → `sam deploy`）→
`release`（**production のみ**。デプロイした SHA にタグと GitHub Release を作る。下記）。

**`build` には `id-token: write` も Environment も付けていない。** PyPI 依存の取得・ビルドの
過程で任意のコードが動き得るため、OIDC トークンを要求できるのはビルド成果物を受け取るだけの
`deploy` に限っている。

CI では `sam deploy --no-confirm-changeset --no-fail-on-empty-changeset` で実行する
（承認は Environment の保護ルールで取る）。`samconfig.toml` の `confirm_changeset = true` は
手元での実行のために残している。

#### production デプロイ後のタグと GitHub Release

production へのデプロイが成功すると、`release` job がデプロイした SHA（`github.sha`）に
**`backend/vX.Y.Z` タグと GitHub Release** を作る。**development ではタグも Release も作らない**
（バージョンを振るのは本番に出したものだけ）。

- **採番とリリースノートは git-cliff**（リポジトリ直下の `cliff.toml`。バージョン 2.14.1 を
  sha512 で検証してインストール）。前回の `backend/v*` タグ以降で `packages/backend/**` に触れた
  コミットを Conventional Commits の type で分類し、Release の本文にする。
  ```bash
  # 手元で次のリリースを確認する（タグは作られない）
  GIT_CLIFF__BUMP__INITIAL_TAG=backend/v0.1.0 git-cliff --offline --unreleased \
    --include-path 'packages/backend/**' --tag-pattern '^backend/v[0-9]+\.[0-9]+\.[0-9]+$' --bumped-version
  GIT_CLIFF__BUMP__INITIAL_TAG=backend/v0.1.0 git-cliff --offline --unreleased \
    --include-path 'packages/backend/**' --tag-pattern '^backend/v[0-9]+\.[0-9]+\.[0-9]+$' --strip all
  ```
  **`--unreleased` を外さないこと。** 外すと、`--include-path` に当たらないコミット（マージコミットなど）に
  付いた前回タグを見失い、全履歴から bump してしまう（2.14.1 で確認）。
- **バージョンの規則**（`cliff.toml` の `[bump]`）

  | 前回タグ以降のコミット | 1.0.0 未満 | 1.0.0 以上 |
  |---|---|---|
  | 破壊的変更（`feat!:` / `BREAKING CHANGE:` フッター） | minor | major |
  | `feat` | minor | minor |
  | それ以外（`fix` / `perf` / `refactor` / `docs` / `test` / `chore` / `build` / `ci` / `style` / `revert`） | patch | patch |

  - **初回（`backend/v*` タグが1つも無い）は `backend/v0.1.0`**。本文はそれまでの全履歴になる。
  - 1.0.0 未満の間は、破壊的変更があっても 1.0.0 には上がらない。1.0.0 への移行は人が判断して行う（手順は未整備）。
  - `Merge ...`、`chore(agent-memory)`、Conventional Commits 形式でないコミット、上表に無い type は
    本文にも採番にも含めない。
- **タグを作らずにスキップする場合**（デプロイ自体は成功扱い。理由は Job Summary に出る）

  | 状況 | 理由 |
  |---|---|
  | デプロイした SHA に既に `backend/v*` タグがある（同じコミットの再デプロイ） | 同じコミットに別の番号を振らない |
  | 最新の `backend/v*` タグがデプロイした SHA の祖先でない（過去のコミットの再デプロイ・ロールバック、古い実行の Re-run） | そこから採番すると既存タグと番号が衝突し得る |
  | 前回タグ以降に、本文に載る `packages/backend/**` のコミットが無い | 中身の無いリリースを作らない |

- `release` job の権限は `contents: write` のみ。AWS に触らないので `id-token` も Environment も
  付けていない（Environment を付けると production の承認がもう一度求められる）。
- タグは `gh release create --target <SHA>` が API で作る。`GITHUB_TOKEN` で作ったタグは
  他のワークフローを起動しない。
- **`CHANGELOG.md` はコミットしない**（Release 本文のみ）。
- `release` job だけが失敗した場合（デプロイは成功済み）は、その job だけを Re-run すればよい。
  Release が作られていればスキップされる。

#### Environment と Variables

| Environment | Variables `AWS_SAM_DEPLOY_ROLE_ARN` | 保護ルール |
|---|---|---|
| `development` | `sanposcape-infra` の dev で `mise run output live/account -raw sam_deploy_role_arn` の値 | なし（ブランチ制限もなし） |
| `production` | prod の `live/account` apply 後に同じ output の値（**未設定**） | Required reviewers = tri-star / Deployment branches = `main` のみ / 管理者によるバイパス不可 |

```bash
gh variable set AWS_SAM_DEPLOY_ROLE_ARN --env development --body '<arn>'
```

- 未設定のまま実行すると `deploy` job の最初のステップが `::error::` で落ちる（AssumeRole は試みない）。
- **ARN をワークフローやドキュメントに直書きしない。** アカウント ID を含むため Variables に置く。
  なお `role-to-assume` に渡した値はステップの入力として**公開リポジトリの Actions ログに表示される**
  （ARN は秘密ではない前提。気になる場合は Environment Secret に移すとマスクされる）。
- デプロイロールの trust は `repo:tri-star/sanposcape:environment:<development|production>` の
  subject だけを許す。Environment を付けない job や `pull_request` からは AssumeRole できない。

#### マイグレーションは手動

CI はマイグレーションを実行しない。デプロイロールに `lambda:InvokeFunction` が無く、
[ADR-005 決定9](../../../docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md#9-alembic-マイグレーションは専用-lambda-の手動-invoke-で実行するapi-本体では走らせない)
でスキーマ変更とデプロイを不可分にしない方針のため。デプロイ完了後の Job Summary にコマンドが出るので、
スキーマ変更を含む場合は手元の AWS 認証情報で §5.2 を実行する。

#### デプロイロールでできないこと

デプロイロール（`sanposcape-infra` の `live/account/sam_deploy.tf`）は、SAM が作るものの名前に
合わせてリソースを絞っている。次の操作は CI からは通らない（手元の管理者権限で行う）。

- **既存の実行ロールへの Permission Boundary の付け外し**（`iam:PutRolePermissionsBoundary` /
  `DeleteRolePermissionsBoundary` を明示的に拒否。prod は SCP でも拒否）
- **境界を付けない実行ロールの作成**、`RoleName` を明示した（CFn の自動命名でない）ロールの作成
- `lambda:InvokeFunction`（migrate の実行を含む）、`lambda:AddPermission`（CloudFront の呼び出し許可は Terraform 所有）
- `ap-southeast-1` 以外のリージョンへの操作
- 命名規則（スタック `sanposcape-backend-<env>` / 関数 `sanposcape-<env>-backend-*` /
  ロググループ `/aws/lambda/sanposcape-<env>-backend-*`）から外れるリソースの作成・変更
- `template.yaml` に新しい種類のリソース（例: SQS、DynamoDB）を足すこと。足す場合は先に
  infra 側のデプロイロールの権限を広げる。**例外**: CloudWatch のダッシュボードとアラームは、
  名前を `sanposcape-<env>-backend-*` に絞って許可する前提（infra の `ManageBackendMonitoring`。SS-179）。
  `logs:PutQueryDefinition` は無いので、Logs Insights の保存済みクエリ（`AWS::Logs::QueryDefinition`）は
  作れない（作らない方針。§14）

## 5. マイグレーション手順

### 5.1 `neon_dsn_unpooled` の投入（初回のみ・Phase 4 までに必要）

マイグレーション Lambda は direct（非 pooled）DSN を使う（理由は
[ADR-005 決定9](../../../docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md#9-alembic-マイグレーションは専用-lambda-の手動-invoke-で実行するapi-本体では走らせない)）。
シークレットに `neon_dsn_unpooled` キーがまだ無い場合は投入する。

**`put-secret-value` は値を丸ごと置き換える。** キー単位の追記 API は無いため、
既存キーを含めた JSON 全体を読んで書き戻す（read-modify-write）。値は画面にも `ps` にも
出ない形で扱う。

```bash
export AWS_PROFILE=sanposcape-dev
read -rs -p 'direct DSN: ' NEW_VALUE; echo

aws secretsmanager get-secret-value --secret-id /sanposcape/dev/shared \
  --query SecretString --output text \
| NEW_VALUE="$NEW_VALUE" python3 -c \
  'import sys,json,os; d=json.load(sys.stdin); d["neon_dsn_unpooled"]=os.environ["NEW_VALUE"]; print(json.dumps(d))' \
| aws secretsmanager put-secret-value --secret-id /sanposcape/dev/shared \
  --secret-string file:///dev/stdin

# 投入後、キー名だけを確認する
aws secretsmanager get-secret-value --secret-id /sanposcape/dev/shared \
  --query SecretString --output text | python3 -c 'import sys,json; print(*sorted(json.load(sys.stdin)), sep="\n")'
```

未投入のままマイグレーション Lambda を invoke すると、`MigrationConfigError` で明示的に
失敗する（`neon_dsn` へフォールバックすることはない）。

### 5.2 マイグレーションの実行

```bash
aws lambda invoke --function-name sanposcape-dev-backend-migrate \
  --region ap-southeast-1 \
  --cli-binary-format raw-in-base64-out --payload '{}' \
  --cli-read-timeout 360 /dev/stdout
```

- **AWS CLI v2 では `--cli-binary-format raw-in-base64-out` が必須**（無いと `--payload` の
  生 JSON を base64 と解釈して失敗する）。`--cli-read-timeout` は CLI 既定が 60 秒で
  Lambda の `Timeout: 300` より短いため明示する（無いと**実際は成功しているのに
  CLI だけタイムアウトする**）。
- 成功すると `{"head": "<リビジョンID>"}` が返る。`alembic/versions/` の最新リビジョンと
  一致することを確認する。
- API 本体と同じビルド成果物（同じ `CodeUri`）を使っているため、デプロイされたコードと
  マイグレーションのリビジョンは必ず一致する。
- **既存テーブルへの列追加では、列を読むコードのデプロイからこの invoke までの間、そのテーブルを
  読む API が `UndefinedColumn` で 500 になる。** デプロイ直後に続けて invoke する。本番稼働後は、
  マイグレーションだけの PR を先にデプロイして invoke し、その後で列を使うコードを出す
  （[ADR-008](../../../docs/adr/ADR-008-deploy-release-separation.md) 決定7 の SS-171 追補）。
- `ReservedConcurrentExecutions=1`（dev。prod はクォータの都合で未設定）により、
  `upgrade head` の同時実行は防がれる。

### 5.3 緊急時のローカル実行（代替手段）

`neon_dsn_unpooled` の値を手元に置いて `docker compose exec api uv run alembic upgrade head`
を実行することも技術的には可能だが、開発者の手元に本番相当の DSN を置くことになり
[ADR-004 決定4](../../../docs/adr/ADR-004-secrets-management-and-cicd-aws-credentials.md#4-lambda-のランタイム秘密は-cd-パイプラインに通さない)
の趣旨（ランタイム秘密を人・CI に通さない）に反する。**dev 環境での緊急時の代替手段としてのみ**
使用し、実行後は環境変数を必ず破棄すること。

## 6. デプロイ後の検証

### 6.1 Phase 3（CloudFront を待たずに直接検証する）

`AuthType=AWS_IAM` が守るのは Function URL であって `lambda:InvokeFunction` ではないため、
デプロイヤーの IAM 権限があれば CloudFront を経由せず直接 invoke できる。

```bash
aws lambda invoke --function-name sanposcape-dev-backend-api \
  --region ap-southeast-1 --cli-binary-format raw-in-base64-out \
  --payload file://events/health-get.json /dev/stdout
```

`{"statusCode":200,...,"body":"{\"status\":\"ok\"}"}` が返ることを確認する。続けて次を確認する。

```bash
# ログ（INIT_START 直後の ERROR が起動失敗の原因を示す）
aws logs tail /aws/lambda/sanposcape-dev-backend-api --since 15m --region ap-southeast-1

# Outputs（FunctionUrl / FunctionName / DashboardName の 3 つが出ること）
aws cloudformation describe-stacks --stack-name sanposcape-backend-dev \
  --region ap-southeast-1 --query 'Stacks[0].Outputs'

# タグ（Project=sanposcape / Env=dev / ManagedBy=sam / Repo=sanposcape）
aws lambda list-tags --resource <上記で得た関数の ARN>
```

### 6.1.1 lifespan が実行環境ごとに1回であることの確認（SS-183）

FastAPI の lifespan（`main._lifespan`）の startup は、Lambda の**実行環境（コールドスタート）
ごとに1回**だけ走り、shutdown は走らない（`aws_lambda/asgi_handler.py`、
[ADR-005 SS-183 追補](../../../docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md)）。
`/health` や `/app-config` を数回叩いたあと、CloudWatch Logs Insights（対象は
`/aws/lambda/sanposcape-<env>-backend-api`）で確認する。

```
fields @logStream, @message
| filter @message like /Application lifespan/
| parse @message /Application lifespan (?<phase>started|shutting down)/
| stats count() by @logStream, phase
```

期待値: ログストリーム（= 実行環境）ごとに `started` が 1 件で、`shutting down` の行は出ない
（0 件）。`shutting down` の行が出る、または `started` が呼び出しごとに増える場合は、lifespan が呼び出しごとに走っている（SS-183 より前の挙動）。

### 6.2 Phase 5（インフラ側 `enable_distribution = true` の apply 後）

> **dev は既に apply 済み（2026-09-11 時点）。** この手順は「待ち」ではなく、いつでも実施できる。
> prod は `enable_distribution = false` のままで `app-api.sanposcape.com` は名前解決しない
> （前提の SAM スタック `sanposcape-backend-prod` のデプロイが未実施・予定日未定）。
>
> ホスト名は infra 側 ADR-0001 §2.11 で確定しており、mobile 用が `app-api.<zone>`、
> 外部向けが `api.<zone>` で**別ホスト**（distribution / WAF / レート制限 / 認証方式を独立させるため）。
> CI やスクリプトから参照する場合は SSM の
> `/sanposcape/<env>/services/backend-api/api_base_url` と `.../distribution_id` が使える（dev のみ存在）。

**完了確認は 3 本立てにする。** インフラ資料の当初案（`/health` 200 / 直叩き 403 の 2 本）
だけでは**認証経路の破綻が露見しない**。`GET /health` は認証不要なので、
[ADR-005 決定4](../../../docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md#4-function-url-の-authtype-は-aws_iamアクセストークンは-x-app-authorization-ヘッダーで運ぶ)
の `Authorization` 上書き問題は 2 本の curl では絶対に検出できず、mobile を CloudFront に
向けた瞬間に初めて「認証必須の全エンドポイントが 401」という形で発覚する。

```bash
# 1) CloudFront 経由は 200
curl -i https://app-api.dev.sanposcape.com/health
#    → HTTP/2 200 / {"status":"ok"}

# 2) Function URL の直叩きは 403（OAC の署名が無いため）
curl -i "$(aws cloudformation describe-stacks --stack-name sanposcape-backend-dev \
  --region ap-southeast-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`FunctionUrl`].OutputValue' --output text)health"
#    → HTTP/2 403 / {"Message":"Forbidden"}

# 3) 認証必須エンドポイントを1本、ヘッダーを変えて2パターン確認する
#    X-App-Authorization を渡す → 200
curl -i https://app-api.dev.sanposcape.com/walks \
  -H "X-App-Authorization: Bearer <有効なアクセストークン>"
#    Authorization だけを渡す（CloudFront が上書きするため中身は届かない）→ 401
curl -i https://app-api.dev.sanposcape.com/walks \
  -H "Authorization: Bearer <有効なアクセストークン>"
```

3 番目のうち、ボディを伴う POST（例: `POST /walks`）を選んで踏めると、
`x-amz-content-sha256` の実装（署名対象のヘッダーがオリジンまで正しく届いているか）まで
同時に確認できる。`FunctionUrl` の値は末尾スラッシュ付き
（`https://xxxx.lambda-url.ap-southeast-1.on.aws/`）なので、上のコマンドのように
パスを直に連結してよい。

#### dev の実施結果（2026-09-12, SS-81）

**dev では上記のうち 1) 2) と 3) の正常系が実証済み。** 3) は curl ではなく
**iOS 実機（`staging-ios` プロファイルの Ad Hoc ビルド）から実際のアプリ操作で踏んだ**ため、
ヘッダー付与・ハッシュ計算を含めて**本番と同じコードパス**を通っている。

| §6.2 の項目 | 状況 |
|---|---|
| 1) CloudFront 経由 `/health` → 200 | ✅ 2026-09-11 |
| 2) Function URL 直叩き → 403 | ✅（上の検証状況表「Function URL 直叩き」の行） |
| 3) 認証必須エンドポイント + `X-App-Authorization` → 200 | ✅ 記録タブの履歴取得（認証必須 GET） |
| 3) ボディを伴う POST（`x-amz-content-sha256` まで） | ✅ `POST /auth/session`（サインイン）/ `POST /walks`（散歩保存） |
| 3) 対照: `Authorization` 単体 → 401 | ⚠️ **未実施**（下記） |

CloudWatch Logs で該当時間帯の 18 リクエストを確認し、**エラー・警告ゼロ**だった。
これにより [ADR-005 決定4](../../../docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md#4-function-url-の-authtype-は-aws_iamアクセストークンは-x-app-authorization-ヘッダーで運ぶ)
の呼び出し契約が**実機で初めて実証された**。

> **対照実験（`Authorization` 単体 → 401）だけは踏んでいない。** アプリは
> `X-App-Authorization` しか送らないため、実機操作では発生しない経路だからである。
> 正常系が通っている以上、運用上の要件は満たされているが、**「なぜ `Authorization` を
> 使ってはいけないか」を自分の目で確認したい場合は上の curl を 1 本実行すること**
> （破壊的操作ではない）。
>
> **検証は iOS 実機のみ。** Android は Google サインインが端末側（Credential Manager 段階）で
> 失敗しており、backend へ到達していない（SS-82）。ただし `X-App-Authorization` の付与と
> `x-amz-content-sha256` の計算は JS 側の共有コードなので、**HTTP 契約としては
> プラットフォームに依存しない**。
>
> **prod は未実施。** `enable_distribution = false` のままで `app-api.sanposcape.com` は
> 名前解決せず、前提の SAM スタック `sanposcape-backend-prod` も未デプロイ。

**あわせて確認する完了条件**:

- マイグレーション Lambda の invoke が成功し、Neon にスキーマが適用されている（§5.2）
- ロググループ `/aws/lambda/sanposcape-dev-backend-api` の `RetentionInDays` が 30
- `docker compose up -d` からの既存ローカル開発フローが従来どおり動く
- backend CI（lint / test / migration smoke）が緑
- フィーチャーフラグ（AppConfig）の疎通確認は §11 も実施する

### 6.3 監視（ダッシュボード・アラーム）の確認（SS-179）

デプロイ後に 1 回、§14「デプロイ後の確認」のコマンドを流す（ダッシュボードとアラームが作られていること、
Application Signals の次元の値がアラームの Dimension と一致すること）。値がずれていると 5xx アラームは
エラー無しで黙って鳴らなくなるため、これは省略しない。

## 7. トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `secret is missing expected keys: [...]`（CloudWatch Logs） | シークレット JSON のキー不足 | シークレットの値を投入し直す（器は Terraform 所有なので触らない） |
| `AccessDeniedException` on `GetSecretValue` | `Policies` の `Resource`（`{{resolve:ssm:}}` の解決結果）とシークレットの実際の ARN が不一致 | SSM パラメータの値とシークレットの ARN を突き合わせる |
| `ResourceNotFoundException`（CloudWatch Logs） | シークレットに値が未投入（prod で起きやすい） | 値の投入を待つ、または投入する |
| `ValidationError` + `loc=('database_dsn',)` | `neon_dsn` の写し漏れ | `core/runtime_config.py` の `SECRET_KEY_TO_ENV` を確認する |
| `MigrationConfigError` | `neon_dsn_unpooled` が未投入 | §5.1 の手順で投入する |
| `Runtime.ImportModuleError: No module named 'psycopg_binary'` | `--use-container` なしでビルドした | `sam build --use-container` でビルドし直す |
| リクエストが 29 秒でタイムアウトする | DSN のホストに到達できない（Neon の IP allowlist が有効、または DSN の誤り） | Neon コンソールで IP allowlist が無効であることを確認する（dev では確認済み・無効） |
| `no such table` / `relation does not exist` | マイグレーション未実行 | §5.2 を実行する |
| `UndefinedColumn`（`column ... does not exist`、既存テーブルの API が 500） | 既存テーブルへの列追加を含むコードをデプロイしたが、マイグレーションがまだ（デプロイから migrate までの隙間） | §5.2 を実行する。本番稼働後は、列追加のマイグレーションだけの PR を先にデプロイして migrate してから、列を使うコードを出す（[ADR-008](../../../docs/adr/ADR-008-deploy-release-separation.md) 決定7 の SS-171 追補） |
| `prepared statement "..." already exists` | Neon の PgBouncer とプロトコルレベルの prepared statement が想定外に衝突した | `DB_DISABLE_PREPARED_STATEMENTS=true` を該当関数の環境変数に設定して再デプロイする（§9 参照） |
| CloudFront 経由だと全エンドポイントで 401（`/health` は 200） | mobile 側が `Authorization` ヘッダーで送っている（CloudFront に上書きされる） | mobile 側が `X-App-Authorization` を送るよう実装されているか確認する（ADR-005 決定4） |
| CloudFront 経由が全部 403（`/health` を含む） | CloudFront からの呼び出し許可（`lambda:InvokeFunctionUrl` / `lambda:InvokeFunction`）が無い、または distribution ID が不一致 | 下記の `get-policy` で確認する。**この許可は Terraform 側が付与するもので、SAM 側の対応は無い** |
| `Runtime exited with error: exit status 1` / `Init failed` としか見えず、原因が分からない | init 時の例外報告そのものが壊れている（下記「init 失敗時にエラー報告自体が壊れる」を参照） | **CloudWatch Logs の `INIT_START` 直後の ERROR を読む**（アプリのログは JSON なので `"level":"ERROR"` の行。`message` に原因が出ている。§15）。真の原因はそこに出ている |
| （CI）`iam:CreateRole` の `AccessDenied` | 実行ロールに Permission Boundary が付いていない（`template.yaml` の `Globals.Function.PermissionsBoundary` が消えた）、SSM `lambda_boundary_arn` の値と infra 側の境界 ARN が不一致、または `RoleName` を明示した | `template.yaml` の境界指定を戻す / SSM の値を確認する / `RoleName` を外す（SS-72） |
| （CI）`iam:PutRolePermissionsBoundary` の `AccessDenied`（`UPDATE_ROLLBACK`） | 境界の無い既存ロールへ、境界を後付けしようとした。デプロイロールはこの操作を明示的に拒否している | **手元の管理者権限で 1 回デプロイする**（下記「境界を初めて入れるデプロイ」）。以後は CI から通る |
| （CI）`Environment '...' に Variables 'AWS_SAM_DEPLOY_ROLE_ARN' が設定されていません` | Environment に Variables が未設定（Repository Variables ではなく Environment 側に置く必要がある） | §4.1 の `gh variable set ... --env <環境>` で設定する |
| （CI）`Not authorized to perform sts:AssumeRoleWithWebIdentity` | ロール ARN の誤り、Environment 名の不一致（trust の subject は `environment:development` / `environment:production`）、または infra 側が未 apply | ARN と Environment 名を確認する。prod は infra の `live/account` の apply が前提 |
| （CI）`cloudwatch:PutDashboard` / `PutMetricAlarm` / `DescribeAlarms` などの `AccessDenied`（SS-179） | デプロイロールに `ManageBackendMonitoring` / `DescribeAlarms` が無い（infra の dev / prod への apply 待ち）、またはダッシュボード・アラームの名前が `sanposcape-<env>-backend-` で始まっていない | §3 Phase 0 の `get-role-policy` で確認する。名前の接頭辞は `test_monitoring_config.py` が固定している。エラー文のアクション名と ARN を infra に伝える（§14） |
| `{{resolve:ssm:/sanposcape/<env>/platform/alerting/topic_arn}}` の解決失敗（`ParameterNotFound`。SS-179） | infra の `live/platform` の alerting が未 apply の環境 | §3 Phase 0 の `get-parameter` で確認する。apply されるまで、その環境へはデプロイできない |
| 5xx のアラームが鳴るはずの状況で鳴らない（SS-179） | Application Signals の Dimension（`Environment` / `Operation` / `Service`）の値がメトリクスとずれている（`TreatMissingData: notBreaching` のため、データ無しは正常扱いで黙る） | §14「デプロイ後の確認」の `list-metrics` で値を確かめ、`template.yaml` の `ApiFaultsAlarm` とダッシュボードを直す。`OTEL_SERVICE_NAME` やデプロイ環境名を変えたときも同じ確認をする |
| （CI）`AccessDenied` で `aws:RequestedRegion` に関するメッセージ / 想定外のリソースで拒否 | `ap-southeast-1` 以外のリージョンを触ろうとした、または命名規則から外れたリソースを作ろうとした | `samconfig.toml` の `region` と `template.yaml` の名前を確認する（§4.1「デプロイロールでできないこと」） |

### 境界を初めて入れるデプロイ（SS-72・環境ごとに 1 回だけ）

`template.yaml` に `PermissionsBoundary` を追加する前にデプロイされたスタックでは、実行ロール
（`ApiRole` / `MigrateRole`）に境界が付いていない。CloudFormation は既存ロールに境界を付けるために
`iam:PutRolePermissionsBoundary` を呼ぶが、デプロイロールはこれを拒否しているため、**最初の
1 回だけは手元の管理者権限でデプロイする。** 境界の付いたロールになった後は、CI から通常どおり
更新できる。

```bash
cd packages/backend
make lambda-requirements && sam build --use-container && sam deploy --config-env dev
```

dev は既存スタックがあるため必須。**GitHub Actions からの最初の dev デプロイより前に
済ませること**（未実施だとそのデプロイは上表の `PutRolePermissionsBoundary` で失敗する）。
（SS-72 の途中で main push による自動デプロイを廃止したため、PR のマージ自体はデプロイを起こさない。）

prod はスタックが未作成の想定なので、最初から境界付きで作られ、この手順は不要。**ただし prod に
境界の無い既存スタックがあった場合、prod では SCP でも `iam:PutRolePermissionsBoundary` を拒否して
いるため、手元の管理者権限でも境界を後付けできない可能性がある**（infra タスク SS-97 の中で確認する）。
prod の初回デプロイは、デプロイロールと `lambda_boundary_arn` の apply（SS-97）を待って行う。

### init 失敗時にエラー報告自体が壊れる（日本語コメントを含むトレースバック）

init（コールドスタート時の import）で例外が発生すると、Lambda の Python ランタイム
（`awslambdaric`）は `post_init_error` で Lambda Runtime API にエラーを報告しようとするが、
**トレースバックのソース行に日本語などの非 Latin-1 文字が含まれていると、この報告自体が
`UnicodeEncodeError` で失敗する。**

```
File "awslambdaric/lambda_runtime_client.py", line 87, in call_rapid
File "http/client.py", line 1431, in _send_request
    body = _encode(body, 'body')
UnicodeEncodeError: 'latin-1' codec can't encode character 'の' in position 1235: Body ('の') is not valid Latin-1
```

エラー報告の body に**トレースバックのソース行がそのまま入る**ため、日本語コメントを含む行が
スタックフレームに混ざると latin-1 エンコードに失敗する。**このリポジトリはコメントが
日本語なので踏みやすい。** 結果として真の例外が `Runtime exited with error: exit status 1` /
`Init failed` に化けて見えなくなる。

ただし**真の原因は stdout/stderr にログとして出力済み**であり、消えているわけではない。
CloudWatch Logs の `INIT_START` の直後に出る次のような ERROR の行を読めば原因が分かる。
アプリのログは 1 行の JSON（SS-180。`aws_lambda/api.py` の先頭でランタイムのハンドラーを
JSON にしてから `Settings` を組み立てるため、検証エラーも JSON で出る）。

```
{"timestamp":"...","level":"ERROR","logger":"sanposcape.aws_lambda.api","message":"Settings validation failed at startup: [{'type': 'missing', 'loc': ('database_dsn',), ...}]"}
```

（`ValidationError` の再送出はランタイムが出すテキストの `[ERROR]` 行として続くことがある。）
これは `src/sanposcape/aws_lambda/api.py` が `ValidationError` を捕捉した際に
`exc.errors(include_input=False, include_url=False)` で**不足フィールド名だけを先に
ERROR ログへ出してから再送出する**設計になっているため（値には秘密情報が含まれ得るので
`include_input=False` にしている）。`post_init_error` の `UnicodeEncodeError` に惑わされず、
まずこの ERROR ログを確認すること。

lifespan の startup（`main._lifespan` の資源の生成）の失敗も init で起きるため、同じく
init エラーになる。この場合は `src/sanposcape/aws_lambda/asgi_handler.py` が
`Application startup failed during Lambda init.` の ERROR を先に出すので、
`INIT_START` の直後のこの行が原因を示す（SS-183）。SS-180 以降は JSON で、`exception_type` と
`exception_stacktrace`（型名とフレームだけ）が付く。**staging / production では例外メッセージは
出ない**（`exception_message` は local / test のみ。§15）ので、メッセージが要る調査はローカルで再現する。

### CloudFront からの呼び出し許可の確認

```bash
aws lambda get-policy --function-name sanposcape-dev-backend-api --region ap-southeast-1
```

期待される状態（2 つの Sid、`principal` はいずれも `cloudfront.amazonaws.com`）:

```
AllowCloudFrontOAC                  lambda:InvokeFunctionUrl  cloudfront.amazonaws.com
AllowCloudFrontOACInvokeFunction    lambda:InvokeFunction     cloudfront.amazonaws.com
```

どちらも `Condition.ArnLike.AWS:SourceArn` が `arn:aws:cloudfront::<account-id>:distribution/<id>`
になっている。**この 2 つが無い、または distribution ID が食い違っている場合、CloudFront 経由が
すべて 403 になる。** この許可は `enable_distribution = true` の Terraform apply で付与される
ものであり、`template.yaml` に `AWS::Lambda::Permission` を書いて SAM 側で対応してはいけない
（§10 参照）。

### 環境変数・シークレットの実値を確認する（切り分け用）

```bash
# 環境変数（シークレット値は入っていない。ARN のみのはず）
aws lambda get-function-configuration --function-name sanposcape-dev-backend-api \
  --region ap-southeast-1 --query 'Environment.Variables'

# シークレットのキー名だけ（値は表示しない）
aws secretsmanager get-secret-value --secret-id <ARN> --query SecretString --output text | python3 -c "import sys,json; print(*sorted(json.load(sys.stdin)), sep='\n')"
```

### 周回ルートの kill switch（緊急停止。SS-33, ADR-007）

`GOOGLE_MAPS_LOOP_ROUTE_ENABLED`（既定 `true`）を `false` にすると、`/explore/routes/loop` は
周回ルートの生成自体を行わず、常に往路を1回取得して「同じ道で戻る」
（`return_is_same_path: true`）応答に固定される。周回ルートの品質が劣化した場合の緊急停止に使う。

`template.yaml` にはこの変数を意図的に設定していない（既定 `true`。`DB_DISABLE_PREPARED_STATEMENTS`
と同じ「フォールバック用の設定は既定では書かない」方針）。本番で止める必要が生じたら、次のいずれかで対応する。

1. **即時停止（redeploy 不要）**: 該当関数の環境変数を直接更新する。Lambda の環境変数は
   差分更新ではなく置換のため、まず現在値を控えてから更新する。

   ```bash
   # 1. 現在の環境変数を控える
   aws lambda get-function-configuration --function-name sanposcape-<env>-backend-api \
     --region ap-southeast-1 --query 'Environment.Variables'

   # 2. 上記の内容に GOOGLE_MAPS_LOOP_ROUTE_ENABLED=false を足して丸ごと渡す
   aws lambda update-function-configuration --function-name sanposcape-<env>-backend-api \
     --region ap-southeast-1 \
     --environment 'Variables={ENV=...,AUTH_MODE=real,MAPS_MODE=real,...,GOOGLE_MAPS_LOOP_ROUTE_ENABLED=false}'
   ```

   **次に `sam deploy` を実行すると `template.yaml` の内容（この変数は未設定）に巻き戻る**一時的な変更である点に注意。恒久的に固定したい場合は下記2を使う。
2. **恒久的な変更（redeploy を伴う）**: `template.yaml` の `Globals.Function.Environment.Variables`
   に `GOOGLE_MAPS_LOOP_ROUTE_ENABLED: 'false'` を追記し、`sam deploy --config-env <env>` で反映する。
   IaC（このリポジトリ）側に変更を残したい場合はこちらを使う。

解除する場合は、同じ手順を `true`（またはキーの削除 → 既定 `true` に戻す）で行う。ローカル開発での
切り替え方法は [local-env.md](./local-env.md) を参照（`.env` の値を直接編集し `docker compose up -d`
でコンテナを作り直す。`restart` では反映されない）。

## 8. `sam local` の限界

`sam local invoke` / `sam local start-api` で検証できるのは次まで。

- ビルド成果物（`--use-container`）でハンドラが解決し、依存が import できること
- payload format 2.0 のイベント → FastAPI ルーティング → レスポンス変換（Mangum の疎通）
- Lambda のメモリ / タイムアウト設定を反映した実行
- `--env-vars` で注入した環境変数での起動時バリデーション（ただし注入できるのは
  `template.yaml` に宣言済みの変数だけ。§4 の注記を参照）

**次は検証できない。** デプロイ後の `aws lambda invoke` + CloudWatch Logs、および
CloudFront 経由の curl が唯一の検証手段になる。

- **CloudFront + OAC の SigV4 署名検証**（`AuthType=AWS_IAM` の 403 / 200 の分岐は
  `sam local` では一切評価されない。Function URL 直叩きが 403 になることは実デプロイでしか
  確認できない）
- **`x-amz-content-sha256` 欠落による 403**（同上）
- **決定4 の `Authorization` ヘッダー上書き**（CloudFront が存在しないため再現しない）
- `{{resolve:ssm:}}` の解決（deploy 時解決。ローカルでは `APP_SECRET_ARN` に実 ARN を
  `--env-vars` で直接指定する。SSM パラメータ自体は引かない）
- IAM ポリシー（`secretsmanager:GetSecretValue` / `appconfig:StartConfigurationSession` /
  `appconfig:GetLatestConfiguration`）が実際に足りているか
- Neon への実接続・レイテンシ・コールドスタート時間・29 秒タイムアウトの境界
- `ReservedConcurrentExecutions` の効果
- **実行環境での使い回し**（SS-183）: `sam local invoke` は呼び出しごとにコンテナを作るので、
  lifespan の資源（キャッシュ・レート制限・AppConfig のセッション）が呼び出しをまたいで残る
  ことは検証できない。ローカルでは pytest の境界テスト（`aws_lambda/tests/test_asgi_handler.py`、
  実際の mangum を通して同じハンドラーを複数回呼ぶ）で確認でき、実環境では dev で確認する（§6.1.1）。

## 9. Neon 接続設定

シークレットの `neon_dsn` は **pooled**（Neon の PgBouncer 経由、ホスト名に `-pooler` を含む）
エンドポイントを指している。API 本体はこれをそのまま使う。

| 設定 | 値 | 理由 |
|---|---|---|
| `DB_POOL_SIZE` | `1` | Lambda インスタンスは同時に 1 リクエストしか捌かない。2 本目以降は死蔵される |
| `DB_MAX_OVERFLOW` | `0` | 同上 |
| `DB_POOL_RECYCLE_SECONDS` | `280` | 5 分未満で自発的に張り直し、Neon 側のアイドル切断済み接続を掴む確率を下げる |
| `DB_DISABLE_PREPARED_STATEMENTS` | 既定 `false`（未設定） | Neon の PgBouncer はプロトコルレベルの prepared statement に対応済み（1 接続あたり最大 1000）のため、psycopg3 の既定（`prepare_threshold=5`）のままで問題ない |

**`DB_DISABLE_PREPARED_STATEMENTS=true` はフォールバック用の設定であり、既定では使わない。**
`prepared statement "..." already exists` のようなエラーが実際に発生した場合にのみ、該当関数の
環境変数へ設定して再デプロイする。`true` にすると `connect_args={"prepare_threshold": None}` が
渡り、psycopg3 の自動 prepared statement 生成が無効化される。

> ★ psycopg3 の生の `prepare_threshold` は「0 = 初回実行から即座に prepare する」という意味で
> あり、「0 = 無効化」ではない（意味が逆）。この読み違いを避けるため、本プロジェクトでは
> `DB_PREPARE_THRESHOLD` という数値の環境変数ではなく `DB_DISABLE_PREPARED_STATEMENTS` という
> bool の環境変数にしている（`config.py` の `db_disable_prepared_statements` フィールド）。

マイグレーション Lambda は **direct（非 pooled）** な `neon_dsn_unpooled` を使う。
Neon 公式が Schema migrations を pooled 接続で行ってはいけない用途として明示しているため
（`SET search_path` 等のセッションレベルの機能がトランザクションごとにリセットされる）。
投入手順は §5.1 を参照。

Lambda は VPC に入れていない。Neon の **IP allowlist は無効**であることを確認済み
（有効だと VPC 外の Lambda の不定な送信元 IP からの接続がすべて拒否される）。

## 10. やってはいけないこと

- **関数名を変更しない。** Terraform が `lambda:AddPermission` で付ける CloudFront の呼び出し
  許可は関数のリソースポリシー側にあり CloudFormation の管理外。関数が置換（実質的な名前変更）
  されると許可が失われ、CloudFront が 403 を返すようになる。
- **CloudFront / WAF / Route53 / ACM / Secrets Manager の器 / アクセスログ S3 を SAM で作らない。**
  すべて Terraform（`sanposcape-infra`）所有。
- **`AWS::Lambda::Permission`（CloudFront からの呼び出し許可）を `template.yaml` に書かない。**
  `enable_distribution = true` の Terraform apply が `lambda:InvokeFunctionUrl` と
  `lambda:InvokeFunction` の 2 つを付ける。SAM 側でも書くと二重管理になる。
- **シークレットの値を環境変数・CloudFormation パラメータ・`template.yaml` に直接書かない。**
  値は実行時に Secrets Manager から取得する（ADR-004 決定4 / ADR-005 決定5）。
- **`.env` をビルド成果物（zip）に含めない。** `Settings` は `env_file=".env"` を見ており、
  Lambda の CWD は `/var/task` のため、`.env` が混入すると意図しない値が優先される。
  `Makefile` は対象を明示列挙してコピーしており、`cp -r . "$(ARTIFACTS_DIR)"` のような
  丸ごとコピーを行わないこと。
- **Lambda を VPC に入れない。** NAT Gateway の固定費と ENI 起因のコールドスタートが乗るだけで
  得るものがない（ADR-005 決定7）。
- **AWS アカウント ID をリポジトリに書かない。** 本リポジトリは public であり、実在する
  アカウント ID は confused deputy を狙ったクロスアカウントの試行やロール名総当たりの
  起点になり得る。シークレットの ARN は SSM の `{{resolve:ssm:/sanposcape/<env>/...}}` の形で
  解決し、テンプレートや手順書には account ID を直接書かない（このドキュメント内の
  `<account-id>` はプレースホルダ）。
- **`sam build --use-container` を省略しない。** `psycopg[binary]` の manylinux wheel が
  ビルドホストの arch/glibc に依存するため、コンテナなしビルドは実行時にしか失敗が判明しない。
  Pillow（SS-88, `sanpo_maps/photos/thumbnails.py`。SS-137 で `pins/` から移動）も同じ理由で
  コンテナビルドが必須（manylinux wheel が
  約 4〜5 MB 増える程度で、zip 50 MB / 展開 250 MB の上限には十分収まる見込みだが、SS-108 の
  dev デプロイで一度は zip サイズを確認すること）。
- **（SS-88）`template.yaml` の Lambda `MemorySize` を下げる変更を単独で入れない。** 写真の
  確定処理（`PhotoAttacher`）は `PIN_PHOTO_CONFIRM_CONCURRENCY`（既定3）並列で Pillow の
  デコード・リサイズを行う前提でメモリ予算を見積もっている（ADR-009 決定5）。
  `MemorySize` を下げる場合は `PIN_PHOTO_CONFIRM_CONCURRENCY` も
  合わせて見直すこと（CPU 割り当ても `MemorySize` に比例するため、下げると確定処理の
  所要時間が伸び `PIN_PHOTO_CONFIRM_DEADLINE_SECONDS` に近づくリスクもある）。
- **（SS-179）監視の分担を崩さない。** ap-southeast-1 の `sanposcape-<env>-backend-*` のダッシュボード・アラームは
  SAM（`template.yaml`）の所有で、infra の services 層（Terraform）はこの接頭辞を ap-southeast-1 に作らない。
  CloudFront のアラーム（us-east-1）は Terraform の所有で、SAM には作らない。名前は必ず
  `sanposcape-<env>-backend-` で始める（デプロイロールの許可の接頭辞。外れると AccessDenied）。
- **（SS-179）Logs Insights の保存済みクエリ（`AWS::Logs::QueryDefinition`）を足さない。** `logs:PutQueryDefinition` は
  デプロイロールに無く、共有の dev で他プロジェクトのクエリに触れる権限になるため。ダッシュボードのウィジェットにする。
- **（SS-179）Application Signals のメトリクスを `Operation` 無しで書かない。** サービス単位には `LambdaService` /
  `InternalOperation` も含まれ、件数が二重になる。`<関数名>/FunctionHandler` の操作に絞る（§14）。
- **（SS-72）`template.yaml` の `PermissionsBoundary` を削除しない。** 境界が無いと CI の
  デプロイロールが `CreateRole` を拒否する。境界はデプロイロールが持つ `PutRolePolicy` /
  `PassRole` による権限昇格を塞ぐ要であり、実行時に新しい AWS 操作が必要になった場合は
  境界を外すのではなく infra 側の境界を先に広げる。
- **（SS-72）実行ロールに `RoleName` を明示しない。** デプロイロールの IAM 権限は CloudFormation の
  自動命名（`sanposcape-backend-<env>-<論理ID>-<乱数>`）に一致するロールだけが対象。
- **（SS-72）`backend-deploy.yml` に `pull_request` / `pull_request_target` トリガーを足さない。**
  このリポジトリは public で、fork の PR からデプロイ経路（Environment と OIDC）に到達され得る。
- **（SS-72）ロール ARN をワークフロー・`samconfig.toml`・ドキュメントに直書きしない。**
  アカウント ID を含むため、GitHub Environment の Variables（`AWS_SAM_DEPLOY_ROLE_ARN`）に置く。

## 11. フィーチャーフラグ（AWS AppConfig, SS-98/ADR-008）

デプロイとリリースの分離の詳細は [ADR-008](../../../docs/adr/ADR-008-deploy-release-separation.md)、
実装の設計判断は同 ADR の「追補: `/app-config` のレスポンススキーマとフラグ取得基盤」を参照。
ここでは運用手順のみをまとめる。

> **`/app-config` は未認証・レート制限なし**（`/health` と同じ扱い）。同一実行環境内の
> 連打はポーリング間隔のキャッシュにより AWS API を叩かず、AWS 側がスロットリングした
> 場合も `_handle_fetch_failure` が吸収して `config_source: "default"` に倒れるため、
> フェイルセーフは機能する（実害は AWS API 呼び出しコストに留まる）。トラフィックが増えて
> 対策が必要になった場合は、backend 側に実装を足すのではなく CloudFront / WAF 側のレート
> 制限に委ねる方針とする（セキュリティレビュー S-1。過去の `/health` 等のレビューでも
> 同様に Low 判定としている）。

### `/app-config` での確認方法

```bash
curl -s https://app-api.<env>.sanposcape.com/app-config | jq
```

```json
{
  "flags": { "pin_registration": false },
  "minimum_supported_versions": { "ios": null, "android": null },
  "config_source": "default"
}
```

`config_source` の読み方（クライアントはこの値で分岐してはいけない。診断専用）:

| 値 | 意味 |
|---|---|
| `appconfig` | AppConfig から正常に取得できている |
| `default` | 未配信（フラグ切り替えワークフロー `feature-flags.yml`（SS-99）がまだ一度も流れていない。**デプロイ直後は必ずこの値になる正常な状態**）、または取得失敗（`APPCONFIG_*` 未設定・IAM 不備・タイムアウト等） |
| `stub` | `FEATURE_FLAG_MODE=stub`（ローカル開発 / テスト専用。dev/prod では起動時バリデーションで弾かれる） |

`default` と `appconfig` のどちらであるべきかは、切り替えワークフローで実際にフラグ値を配信済みかどうかで決まる
（切り替え手順は [release-runbook.md](../../../docs/release-runbook.md) §3）。
`default` が続く場合は CloudWatch Logs（後述）で「未配信（INFO）」か「取得失敗（ERROR）」かを
切り分ける。

### 反映までの遅延要因

フラグを ON にしてから `/app-config` に反映されるまでの時間は、次の合計になる。

1. **AppConfig のデプロイのベイク時間**（Deployment Strategy が持つ待機時間。sanposcape-infra の設定で dev 0 分 / prod 1 分）
2. **ポーリング間隔**（`APPCONFIG_POLL_INTERVAL_SECONDS`、既定60秒。実行環境ごとに独立してカウントする）
3. **実行環境（Lambda コンテナ）ごとのばらつき**（コールドスタート・コンテナの入れ替わりで
   ポーリングのタイミングが揃わない）

「フラグを ON にしたのに反映されない」と感じても、まず数分待ってから切り分けること
（即座に反映されないのは仕様であり、`Cache-Control: no-store` にしているのは CDN 側の
キャッシュを疑わなくて済むようにするためであって、AppConfig 側の遅延は無くならない）。

> **（SS-183 注記）** SS-183 より前の Lambda は、mangum の `lifespan="auto"` により
> 呼び出しごとに `AppConfigFlagSource` を作り直し、毎回 AppConfig から取得し直していた。
> そのため SS-183 より前の Lambda では、フラグを切り替えるとポーリング間隔を待たずに次の
> 呼び出しで反映される挙動だった（dev でのフラグ切り替えの実行実績は無く、観測した事実では
> ない）。今後は上記のとおり、ポーリング間隔ぶん遅れて反映される。

### CloudWatch Logs で見るポイント

```bash
aws logs tail /aws/lambda/sanposcape-<env>-backend-api --since 15m --region ap-southeast-1
```

（ログは JSON。以下の文言は `message` フィールドに入る。`filter message like /AppConfig/` で引ける。§15）

- `AppConfig has no deployed configuration yet; using default flags.`（INFO）: 未配信。
  SS-99 が一度も流れていなければ正常。
- `Failed to fetch AppConfig configuration: <ExceptionType>`（ERROR）: 取得失敗。
  下記トラブルシュートを参照。
- `APPCONFIG_* is not configured; all feature flags are OFF.`（ERROR、起動時1回）:
  `APPCONFIG_*` の環境変数が1本でも空のまま起動した（`UnconfiguredFlagSource`）。
  `template.yaml` の SSM 解決か SSM パラメータ自体を確認する。

### トラブルシュート

| 症状 | 原因 | 対処 |
|---|---|---|
| `AccessDeniedException` on `StartConfigurationSession` / `GetLatestConfiguration` | 境界（SS-95）のアクション名が `appconfigdata:` になっている（正しくは `appconfig:`）、または `template.yaml` の `Resource` ARN と実際の AppConfig の ID が不一致 | 境界のポリシー（`sanposcape-infra`）のアクション名前空間を確認する。ARN は境界側がワイルドカード、`template.yaml` 側が完全 ARN（3本の SSM ID から組み立て）なので、両方を突き合わせる |
| `/app-config` が常に `config_source: "default"` | `APPCONFIG_*` が未設定（CloudWatch Logs に ERROR）、または未配信（SS-99 が一度も流れていない。この場合は正常） | 上記「CloudWatch Logs で見るポイント」でログレベルを確認する |
| デプロイ直後、`sam deploy` 自体が `{{resolve:ssm:}}` の解決に失敗する | `/sanposcape/<env>/platform/appconfig/*` の SSM パラメータが存在しない（SS-94 が当該環境にまだ apply されていない） | Phase 0 の確認コマンドで存在を確認し、無ければ infra 側（SS-94）の apply を待つ |

#### 各環境への初回デプロイで 1 回だけ確認すること（SS-98 / PR #88）

AppConfig 読み取りの IAM `Resource` は、入れ子の `!Sub` の変数マップに動的参照
（`{{resolve:ssm:}}`）を埋める形で組み立てている。**`sam validate --lint` はこの解決が
意図どおりかを検証できない**ため、環境ごとの初回デプロイ時に次を 1 回だけ確認する。

```bash
# 処理後テンプレートで Resource が完全な ARN に解決されているかを見る
# （SSM 動的参照の AWS 公式ドキュメントが明示的に推奨している検証手順）
aws cloudformation create-change-set --stack-name <stack> --change-set-name verify-appconfig-arn ... 
# → マネジメントコンソールのチェンジセット > Template タブで Resource の最終値を目視
```

そのうえで、デプロイ後の CloudWatch Logs に
`AccessDeniedException` on `StartConfigurationSession` が出ないことを確認する。

この形が正しく解決されること自体は AWS 公式ドキュメントで裏取り済みである
（`Fn::Sub` の Supported functions に `Fn::Sub` 自身が含まれる／動的参照の解決は
transform と組み込み関数の評価が終わった**後**の独立したステップであり、解決対象は
関数評価後の最終文字列である）。それでも実デプロイでの確認を残すのは、失敗した場合に
`sam validate` を通過したまま実行時まで露見しないため。なお**失敗モードは安全側**で、
解決が崩れれば ARN として無効な文字列が残り `AccessDeniedException` になるのであって、
ワイルドカードや過剰権限の方向には倒れない。

## 12. 写真ストレージ（S3, SS-88/ADR-009。SS-108 で結線）

設計の詳細は [ADR-009](../../../docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md)
を参照。`template.yaml` への結線は SS-108（旧称 BK-1）で行った。

### 結線の内容

| 項目 | 値・方針 |
|---|---|
| バケット | `sanposcape-<env>-pin-photos-<account_id>`（`ap-southeast-1`）。infra の `live/platform`（SS-106）所有で、SAM では作らない |
| SSM: バケット名 | `/sanposcape/<env>/platform/pin_photos/bucket_name` → Api の環境変数 `PIN_PHOTO_BUCKET_NAME` |
| SSM: バケット ARN | `/sanposcape/<env>/platform/pin_photos/bucket_arn` → Api の実行ロールポリシーの `Resource` |
| `STORAGE_MODE` | Globals で `real` を明示（コード既定と同じ。`ENV=staging/production` では `real` 以外は起動失敗） |
| 実行ロールへの付与方法 | **インライン `Statement`（`S3CrudPolicy` 等の SAM ポリシーテンプレートは使わない）**。ポリシーテンプレートは prefix で絞れず（`BucketName` 引数しか取らない）、境界の外のアクション（`PutObjectAcl` 等）まで一覧に入り、テンプレートを読んでも実効権限が分からなくなる |
| 付与するアクション | `staging/*`・`original/*`・`thumb/*`: `s3:PutObject` / `s3:GetObject` / `s3:DeleteObject`。バケット: `s3:ListBucket`（`Resource` はバケット ARN そのもの、`/*` を付けない） |
| 境界（SS-107） | `sanposcape-<env>-*` に Put/Get/Delete/AbortMultipartUpload + ListBucket。実効権限 = 境界 ∩ 付与。ここに無いアクション（タグ付け等）が要るときは先に infra 側の境界を広げる |
| Migrate 関数 | `PIN_PHOTO_BUCKET_NAME` と S3 のポリシーは付けない（写真操作を行わないため）。`STORAGE_MODE: real` だけは Globals 経由で渡るが、コード既定と同じ値で、Migrate はストレージを組み立てないため影響は無い |

**抜けやすい罠**:

- **`staging/*` への `s3:PutObject` を外すと、presigned POST への実際のアップロードが全て 403 になる**
  （署名の発行自体は成功するため、デプロイでは検知できない）。`CopyObject`（staging→original）は
  コピー元の `GetObject` + コピー先の `PutObject` で足りる（追加アクション不要）。
- presigned POST の `fields` に **`acl` を含めない**（バケットが `BucketOwnerEnforced` のため失敗する）。
  暗号化ヘッダーも送らない（デフォルト SSE-S3）。実装は `integrations/aws/s3.py` の
  `S3ObjectStorage.create_upload_form`。

### 前提となる infra の apply（環境ごと）

`{{resolve:ssm:}}` は存在しない SSM パラメータを参照すると **`sam deploy` 自体が失敗する**
（写真と無関係な修正のデプロイも止まる）。

| 環境 | 必要な apply | 状況（2026-09-22） |
|---|---|---|
| dev | `deployments/dev/account`（SS-107: 境界に S3）と `deployments/dev/platform`（SS-106: バケット + SSM） | ✅ どちらも apply 済み |
| prod | `deployments/prod/account`（2026-09-05 から main に追随していない。Lambda 境界そのもの・sam-deploy ロール・`lambda_boundary_arn` の SSM（SS-97）に、境界の AppConfig（SS-95）・S3（SS-107）の追加も含めて1回の apply にまとまる）と `deployments/prod/platform`（SS-106 + AppConfig 一式 + フラグ切り替えロール） | ⚠️ **未 apply** |

**prod を壊さないための整理**: `template.yaml` は dev/prod 共通で、環境による条件分岐は入れていない。
prod の backend デプロイは、写真と関係なく既に `platform/appconfig/*`（SS-98）と
`account/lambda_boundary_arn`（SS-72）の SSM を前提にしており、どちらも prod には未 apply のため
**現時点で prod デプロイはそもそもできない**。`deployments/prod/platform` の apply で AppConfig と
`pin_photos/*` の SSM が同時に作られる（SS-106 は main にマージ済み）ので、この結線で prod の
前提が新たに増えることはない。prod の順序は次のとおり（infra 側の作業はユーザーの承認のうえで行う）:

1. `deployments/prod/account` の apply（SS-97 + SS-107。SS-179 の `ManageBackendMonitoring` も同じ apply で入れる）→
   `production` Environment の `AWS_SAM_DEPLOY_ROLE_ARN` を設定（§4.1）
2. `deployments/prod/platform` の apply（SS-106 + AppConfig）。1 と並行でよい。アラームの通知先
   （`platform/alerting/topic_arn`、SS-179）は prod にも存在する（2026-10-05 確認）
3. Phase 0 の確認コマンドを `prod` に読み替えて、`pin_photos/*` を含む SSM が揃っていることを確認
4. backend の prod デプロイ → マイグレーション（§5.2）
5. 下の「初回デプロイで確認すること」を prod でも 1 回行う

> **境界（SS-107）だけが抜けた場合**、デプロイは成功するが実行時に S3 がすべて 403 になり、
> 写真の**書き込み系** API（アップロード枠発行・確定）が 503 を返す（写真なしのピン登録・
> 地図の取得は動く）。**閲覧系**（`GET /pins` 等, BK-4）は 503 にはならず、200 のまま
> `thumbnail`/`original_url` が null で返る（ADR-009 決定18）。**編集**
> （`PATCH /pins/{pin_id}`, BK-5）は S3 のオブジェクトを操作しないので影響を受けず、
> DB を更新して 200 を返す（応答の `PinRead` の写真 URL は閲覧系と同じ扱い）。**削除系**
> （`DELETE /pins/{pin_id}`・`DELETE /pins/{pin_id}/photos/{photo_id}`, BK-5。地図単位の
> `DELETE /sanpo-maps/{sanpo_map_id}`, BK-6）も 503 にはならず、DB の削除は成功して
> 204 を返す（S3 側の削除は失敗して WARNING ログのみ残り、`original/`・`thumb/` の
> オブジェクトが孤立して残る。ADR-009 決定22, SS-112。地図削除は決定28, SS-113）。prod で
> `pin_registration` を ON にするのは BK-2（アカウント削除時の写真削除）の後なので、
> それまでは利用者影響は無い。

Fn::If で prod だけ結線を外す案は採らなかった。prod のデプロイは上記のとおり `platform` の apply を
待つ必要があり分岐の効果が無いこと、非選択分岐の動的参照が解決されないかを本リポジトリで
確かめていない（分岐自体が新たな未検証点になる）こと、prod のデプロイは main 限定 +
Required reviewers の手動起動（§4.1）で順序を人が守れることが理由。

### 初回デプロイで確認すること（環境ごとに 1 回）

**動的参照の後ろに `/staging/*` などの文字列を連結する書き方は、dev では 2026-09-24（SS-88）に
解決を確認済み**（下の確認 3) を実施し、`Resource` が完全な ARN になっていた）。**prod は未確認**
なので、環境ごとに 1 回この確認を行うこと。`cfn-lint` / `sam validate` はこの解決を検証できない。
万一 `{{resolve:...}}` の文字列が `Resource` に残った場合は、IAM がポリシーを不正として拒否して
デプロイ時に失敗するか（`MalformedPolicyDocument`）、ポリシーが付いても一致しないため実行時の
403 になるかのどちらかになる。どちらも安全側で、過剰権限の方向には倒れない。

```bash
ENV=dev  # prod のときは prod
# 1) SSM が存在すること（Phase 0 と同じ）
aws ssm get-parameter --name /sanposcape/$ENV/platform/pin_photos/bucket_name --region ap-southeast-1
aws ssm get-parameter --name /sanposcape/$ENV/platform/pin_photos/bucket_arn --region ap-southeast-1

# 2) Lambda の環境変数にバケット名が入っていること（空なら UnconfiguredObjectStorage で
#    写真の書き込み系 API が 503。閲覧系（GET /pins 等）と編集（PATCH /pins/{id}）は
#    200 のまま URL が null になる。削除系（DELETE /pins/{id}、DELETE /pins/{id}/photos/{id}、
#    DELETE /sanpo-maps/{id}）は DB を削除して 204 を返し、S3 の後始末は WARNING を出して
#    スキップする）
aws lambda get-function-configuration --function-name sanposcape-$ENV-backend-api \
  --region ap-southeast-1 \
  --query 'Environment.Variables.{STORAGE_MODE:STORAGE_MODE,PIN_PHOTO_BUCKET_NAME:PIN_PHOTO_BUCKET_NAME}'

# 3) 実行ロールのインラインポリシーで Resource が完全な ARN + prefix に解決されていること
ROLE=$(aws lambda get-function-configuration --function-name sanposcape-$ENV-backend-api \
  --region ap-southeast-1 --query Role --output text | awk -F/ '{print $NF}')
aws iam list-role-policies --role-name "$ROLE"
aws iam get-role-policy --role-name "$ROLE" --policy-name <上で出た ApiRolePolicy0 等> \
  --query 'PolicyDocument.Statement[?contains(to_string(Action), `s3:`)]'
#    → Resource が arn:aws:s3:::sanposcape-<env>-pin-photos-<account_id>/staging/* 等になっていること
#      （{{resolve:ssm:...}} の文字列が残っていないこと）。ListBucket は /* 無しのバケット ARN
```

そのうえで、写真付きのピン登録を実際に 1 回通す（dev は mobile の実機 / エミュレータから。
CloudFront 経由の POST はボディの `x-amz-content-sha256` が要るため、curl より mobile のほうが手早い）:

1. マイグレーション（§5.2）で SS-88 のテーブルが入っていること（`{"head": ...}` が最新）
2. フラグ `pin_registration` を当該環境で ON にする（ADR-008 のフラグ切り替えワークフロー, SS-99）。
   `GET /app-config` の `flags.pin_registration` が `true` になるのを確認する。
   **このワークフローは PR #94（SS-99）のマージが前提**（`workflow_dispatch` は default branch に
   ワークフロー定義が無いと起動できない。ADR-008 はフラグの切り替えをこのワークフローに限っている）。
   #94 のマージ前は、上の確認 1)〜3) と CloudWatch Logs の確認までを先に済ませ、
   手順 2 以降は #94 のマージ後に行う
3. mobile で散歩中画面 →「この場所にピンを追加」→ 写真を 1 枚以上付けて保存
4. 確認する点:
   - 保存が成功し、ピン詳細（または地図）でサムネイルが表示される（presigned GET が通っている）
   - `aws s3 ls s3://<bucket>/original/ --recursive` と `.../thumb/` にオブジェクトが増えている
     （`staging/` の分は確定時に削除される）
   - CloudWatch Logs（`/aws/lambda/sanposcape-<env>-backend-api`）に `S3 operation failed` や
     `PIN_PHOTO_BUCKET_NAME is not configured` が出ていない
5. 失敗した場合は下のトラブルシュートで切り分ける。dev で確認できるまで prod の `pin_registration` は ON にしない

### トラブルシュート

| 症状 | 原因 | 対処 |
|---|---|---|
| 写真ありの `POST /pin-photo-uploads`・`POST /pins` が常に 503、ログに `PIN_PHOTO_BUCKET_NAME is not configured` | 環境変数が空（`UnconfiguredObjectStorage`） | 上の確認 2) で環境変数を確認する。空なら SSM の値を確認して再デプロイ |
| presigned POST の発行は成功するが実際のアップロードが 403 | 実行ロールに `staging/*` への `s3:PutObject` が無い、境界（SS-107）が未 apply、または動的参照 + 連結が ARN に解決されていない | 上の確認 3) でポリシーの `Resource` を確認する。境界は infra 側で確認する。デプロイ自体は成功するため気付きにくい |
| 確定（`POST /pins`）が 503、ログに `S3 operation failed: ClientError` | 上と同じ（`original/*`・`thumb/*` への Put、`staging/*` の Get/Delete の不足） | 同上 |
| `GET /pins` 等の閲覧系は 200 だが `thumbnail`/`original_url` が常に null | 環境変数が空（`UnconfiguredObjectStorage`）、または署名用の認証情報を取得できない（ログに `S3 operation failed`）。閲覧系は 503 にしない設計（ADR-009 決定18）なので、書き込み系のように 5xx では気付けない。presigned GET の生成はローカルの署名計算だけなので、`s3:GetObject` の不足では null にならない（URL は返り、取得時に 403 になる。次の行） | 上の確認 2) で環境変数を確認する。空でなければ CloudWatch Logs で認証情報まわりのエラーを確認する |
| 一覧・詳細の presigned GET（`thumbnail.url`/`original_url`）を取得すると 403 | 実行ロールに `original/*`・`thumb/*` への `s3:GetObject` が無い、または URL の有効期限（`urls_expire_at`）を過ぎている | 上の確認 3) でポリシーの `Resource` を確認する。期限切れなら応答を取り直す（presigned URL は応答のたびに再発行される） |
| 存在しないアップロード枠が 409 ではなく 503 になる | `s3:ListBucket` が無い（または Resource に `/*` を付けてしまった）ため、存在しないキーの HEAD/GET が 403 → `ObjectStorageUnavailableError` に倒れている（backend 側の意図的な安全側フォールバック） | `ListBucket` の Resource がバケット ARN そのものになっているか確認する |
| ピン・写真を削除（`DELETE`）しても `original/`・`thumb/` のオブジェクトが S3 に残り続ける | 削除 API は決定22により 503 にしない設計のため、境界不足・時間予算の不足（2つ目以降のチャンクは残り時間が1回の最悪時間に満たなければ始めない, PR #101 レビュー対応）・ストレージ障害があっても DB の削除自体は成功し 204 を返す。削除専用の client は再試行しないため、一時的な S3 の不調でも孤立が増えうる。S3 側の削除失敗は CloudWatch Logs の WARNING（`Failed to delete N pin photo objects: ...`、または `Skipping remaining pin photo object cleanup: not enough time before the delete deadline ...`）にしか残らない | 上の確認 3) で `staging/*`・`original/*`・`thumb/*` への `s3:DeleteObject` を持つか確認する。孤立オブジェクトは利用者の容量には影響しない（DB 集計のため）が、コストは発生し続けるため BK-3 の定期掃除が入るまでは手動で確認・削除する |
| 端末で「アップロードに失敗しました」になるが、CloudWatch Logs にも S3（CloudTrail データイベント）にも痕跡が無い | 直送は端末 → S3 で完結し backend を通らない。CloudTrail のデータイベントは呼び出し元を特定できたリクエストしか記録せず、認証前に弾かれる失敗や「そもそも送信されていない」ケースは残らない（ADR-009 追補「直送の失敗は原理的にサーバー側から見えない」） | まず**端末側の `logDiagnostic`**（`pin-photo.upload.*`。Metro / `adb logcat -s ReactNativeJS` / Console.app）を見る。次に backend のアクセスログで枠発行（`POST /pin-photo-uploads -> 201`）まで到達しているかを確認する。サーバー側から見る必要がある場合は **S3 サーバーアクセスログ**を一時的に有効化する（infra 作業。CloudTrail では取りこぼす） |
| `sam deploy` 自体が `{{resolve:ssm:}}` の解決に失敗する | `pin_photos/*` の SSM が当該環境に無い（SS-106 が未 apply） | infra 側の apply を待つ（上の確認 1)）。prod は「前提となる infra の apply」の順序を参照 |
| 動的参照 + `/staging/*` の連結がどうしても ARN に解決されない | CloudFormation が連結を受け付けない（**dev では解決を確認済み**（2026-09-24）。prod で再発した場合の備え） | infra 側に prefix ごとの ARN（`staging/*` 等）を SSM の契約値として追加してもらい、連結をやめる |

## 13. トレース（OpenTelemetry。ADR-013 / SS-178）

`Api` 関数だけが、ADOT（AWS Distro for OpenTelemetry）レイヤーと Active Tracing でリクエストを
トレースする。`Migrate` と Globals は対象外。トレースの出力先は X-Ray / CloudWatch
（Transaction Search の `aws/spans`、Application Signals）。方針は
[ADR-013](../../../docs/adr/ADR-013-observability-adot-application-signals.md)。

### 構成（template.yaml の Api）

| 項目 | 内容 |
|---|---|
| レイヤー | `arn:aws:lambda:ap-southeast-1:615299751070:layer:AWSOpenTelemetryDistroPython:28`（版固定） |
| `Tracing` | `Active`（SAM が `AWSXrayWriteOnlyAccess` を実行ロールに付ける） |
| 管理ポリシー | `CloudWatchLambdaApplicationSignalsExecutionRolePolicy` |
| 有効化 | `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-instrument`（TracerProvider を作る）と `TRACING_ENABLED=true`（アプリ側の計装を有効にする） |
| 自動計装 | `OTEL_PYTHON_DISABLED_INSTRUMENTATIONS` にレイヤーの既定値を明示 → 自動は botocore だけ。fastapi / sqlalchemy / httpx は、起動時（sitecustomize）の `sys.path` に `/var/task`（zip）が無く自動計装の依存チェックを通らない（SQLAlchemy 2.1 は版の上限にも弾かれる）ためアプリから手動で計装する。urllib は JWKS の URL などのクエリを `http.url` から除くフックを付けるため手動で計装する。threading は `ThreadPoolExecutor` のワーカーの子スパンをリクエストのトレースに繋ぐために手動で有効にする |
| 伝播 | `OTEL_PROPAGATORS=xray`（クライアントの `traceparent` / `baggage` は無視される。CloudFront が転送する `X-Amzn-Trace-Id` の扱いは dev で要確認） |
| flush | `OTEL_INSTRUMENTATION_AWS_LAMBDA_FLUSH_TIMEOUT=1000`（ms。既定 30 秒は Lambda の Timeout 29 秒より長い） |

### 前提（infra）と prod

- レイヤーの参照と管理ポリシーの付与には、デプロイロールの `lambda:GetLayerVersion` /
  `iam:AttachRolePolicy` 対象の許可と、Permission Boundary 側の X-Ray / logs の許可が要る。
  これは infra の **SS-185**（dev は適用済み）。
- **prod は SS-185 の prod 適用までデプロイできない**（Api 関数の作成が失敗する）。
  prod は未デプロイなので、このテンプレートの変更自体は先に main に入れてよい。

### OpenTelemetry を zip に入れない理由

Lambda の `sys.path` では `/var/task`（zip）が `/opt/python`（レイヤー）より前に来る。zip に
`opentelemetry-*` を入れると、起動時にレイヤーから読み込まれた SDK と版が混ざる。
そのため `pyproject.toml` の `dev` グループにだけ置き（boto3 と同じ扱い）、
`uv export --no-dev` で除く。`Makefile` の `build-Api` は、成果物に `opentelemetry*` があれば失敗する。
一方 `sqlalchemy[asyncio]`（greenlet）は runtime 依存: SQLAlchemy の計装が `sqlalchemy.ext.asyncio`
を import するため（SQLAlchemy 2.1 は greenlet を既定で含まない）。

### レイヤーの版を上げる手順

1. dev で先に確かめる（ローカルでは確かめられない）。
2. 新しい版が同梱する `opentelemetry-*` の版に、`pyproject.toml` の `dev` グループを `==` で合わせて
   `uv lock` する（`.github/dependabot.yml` は `opentelemetry-*` を ignore している）。
3. 新しいレイヤーの `otel-instrument` の既定の無効リストと `OTEL_PYTHON_DISABLED_INSTRUMENTATIONS`
   （template.yaml と compose.yaml の 2 か所）が一致しているか見直す。
4. dev のコールドスタート（`Init Duration`）・展開後のサイズ（zip + レイヤーで 250MB 未満）・スパンの中身を確かめる。
5. ダッシュボードのルート別の表（§14 の Q1）にルートとステータスが出ること（親スパンの `http.status_code` や `kind` の付き方が変わると表が空になる）。

### 緊急停止

```bash
aws lambda update-function-configuration --function-name sanposcape-<env>-backend-api \
  --region ap-southeast-1 \
  --environment "Variables={...現在の値から AWS_LAMBDA_EXEC_WRAPPER を除き TRACING_ENABLED=false...}"
```

`update-function-configuration --environment` は**環境変数を丸ごと置き換える**ため、先に
`aws lambda get-function-configuration` で現在の値を取得して編集すること。恒久化は template.yaml を
戻して redeploy する。

### 操作名とルート別の集計（ADR-013 決定2 の結論）

Application Signals の操作名は、Lambda 上では ADOT が `<関数名>/FunctionHandler` に固定する
（`aws.local.operation` をアプリが書き換えても効かない。dev の他プロジェクトの実データで確認し、
sanposcape 自身の dev でも操作が `sanposcape-dev-backend-api/FunctionHandler` だけになることを確認した）。そのため
API 全体の RED・アラーム・SLO は Application Signals で、**ルート別の内訳は `aws/spans` を
`http.route` / スパン名で集計する Logs Insights**（SS-179）で見る。Lambda 計装の親スパン
（Mangum 構成では LOCAL_ROOT）には、スパン名 `METHOD ルートテンプレート` と `http.route` を
`aws_lambda/tracing.py` が付ける。

### 外へ出さない情報

**Lambda 計装の親スパンはハンドラーの後に属性を設定し直す**（dev の実測で判明。レイヤーの Lambda 計装は 0.61b0）。ハンドラーの中でスパン属性を書き換えても、イベントから `http.route`（生のパス）・`http.target`（クエリ込み）・`http.user_agent` が再設定される。そのため `aws_lambda/tracing.py` は、Mangum が `scope["aws.event"]` に持つ同じイベントを無害化している（`rawQueryString` を空、`userAgent` を削除、`requestContext.http.path` をルートのテンプレートに）。payload 2.0 のみ対象。レイヤーを上げるときは、dev の `aws/spans` で親スパンの `http.target` / `http.route` / `http.user_agent` を確認すること。

クエリ文字列・ヘッダー・ボディ・SQL のバインド値は属性に載せない（ADR-013 決定6）。
`http.url` / `http.target` のクエリはフックで除き（失敗時は空に倒す）、`net.peer.ip` /
`net.peer.port` / `http.user_agent` は空に上書きし、`hide_parameters=True` で例外メッセージの
`[parameters: ...]` を消している。SQLAlchemy のエラー status は「例外の型名 + SQLSTATE」だけで、
例外メッセージ（一意制約違反の `DETAIL` のキー値）は載せない（自前リスナーに差し替え。
`core/observability.py`）。5xx に変換した例外のスパンのイベントも型名だけ。
**未処理の 500（SS-180 で解消）**: `AccessLogMiddleware` が未処理例外を握って 500 を返す
（再送出しない）ため、OTel の FastAPI 計装の `ExceptionHandlerMiddleware`（message とスタック
トレースを exception イベントに自動で付ける）に例外が届かない。スパンには型名だけの
exception イベントが残る。ログの例外も、staging / production では型名・フレーム・SQLSTATE
だけで message は出さない（§15、ADR-013 決定6 の SS-180 追補）。
**応答の開始後**に出た例外だけは握れず、OTel の既定の挙動に戻る（今はストリーミング応答も
BackgroundTasks も無く、実際には起きない）。

## 14. メトリクス・ダッシュボード・アラーム（ADR-013 / SS-179）

API の呼び出し頻度・レイテンシ・エラー率・メモリ・コールドスタートを見るための、ダッシュボード 1 枚と
アラーム 3 本。どちらも `template.yaml` が所有し、Lambda スタックと一緒に作られ・消える。

> **検証状況（2026-10-05、infra 経由の dev 読み取り）: クエリとメトリクスの次元は dev の実データで確認済み。デプロイは未実施。**
>
> 確認済み（クエリの案どおりで確定）:
>
> - スパン（`aws/spans`）: `kind` は文字列 `'SERVER'`、`attributes.http.status_code` と `durationNano` は数値、
>   トレース ID はトップレベルの `traceId`（32 桁の 16 進）、`resource.attributes.deployment.environment` は `dev`、
>   `scope.name` は `opentelemetry.instrumentation.aws_lambda`。Q1 の 2 段の `fields`（別名の再参照と `floor`）と Q2 は構文エラーなく通り、
>   実データで集計できた。REPORT 行のクエリ（Q5 / Q6）も通り、`@maxMemoryUsed / 1000 / 1000` は REPORT 行の `Max Memory Used`（MB）と一致した。
> - `traceId` は、関数ログの REPORT 行の `XRAY TraceId: 1-xxxxxxxx-yyyy…` から `1-` とハイフンを除いた文字列と一致する（ログとの突き合わせに使える）。
> - ルートに一致しない 404 は、`name` がメソッドだけ（`GET`）で、`http.route` のフィールド自体が無い。4xx のスパンの `status.code` は `UNSET`
>   （5xx のスパンは 7 日間に無く、`Fault` の定義と `status.code` は未確認）。
> - **`attributes.aws.span.kind = 'LOCAL_ROOT'` だけでは HTTP 以外のスパンも入る。** 初期化時の Secrets Manager 取得
>   （`kind = 'CLIENT'`、`Secrets Manager.GetSecretValue`）も `LOCAL_ROOT` なので、**`kind = 'SERVER'` との併用が必須**（ダッシュボードのクエリは併用している）。
> - Application Signals: 名前空間 `ApplicationSignals`、メトリクスは `Latency` / `Error` / `Fault` / `Throttle`、`Environment` の値は `dev`
>   （`lambda:default` などは無い）。**サービス単位 `{Environment, Service}` には `<関数名>/FunctionHandler` のほか `<関数名>/LambdaService` と
>   `InternalOperation`（初期化時の Secrets Manager など）の操作も含まれる**ため、ダッシュボードとアラームは
>   `{Environment, Operation, Service}`（`Operation` = `<関数名>/FunctionHandler`）で見る（dev に存在を確認した次元の組み合わせ）。
> - 関数単位の `AWS/Lambda` の `ConcurrentExecutions`（次元 `FunctionName`）がある。
> - 通知先: SSM `/sanposcape/{dev,prod}/platform/alerting/topic_arn` は両方あり、メールの購読は確認済み。SNS のトピックポリシーは
>   `cloudwatch.amazonaws.com` の Publish を自アカウント（`aws:SourceAccount`）に限って許可し、KMS の CMK は使っていない。
> - dev のダッシュボードは他プロジェクトの 1 枚のみ。これを足すと 2 / 3 枚（無料枠内）。
>
> **未確認（dev へのデプロイ後に確認して、この節と ADR-013 に追記）**:
>
> - ダッシュボードの全ウィジェットが描画されること
> - `bin(1h)` と `name` を両方 `by` に入れた線グラフが描けるか（Q4。描けなければウィジェットを外す）
> - タイムアウト / OOM のログの文言（Q7。実際に起きたときに確かめる）
> - サンプリングの影響: `aws/spans` の件数、Application Signals の `SampleCount(Latency)`、Lambda の `Invocations` の差。
>   `aws/spans` は sampled なスパンだけだが、Application Signals のメトリクスが同じ影響を受けるかは **分かっていない**
>   （ADOT は sampled でないスパンもメトリクス化する設計の可能性がある）。同じ期間の `SampleCount(Latency)` と `Invocations` を比べて確かめる
> - デプロイそのもの（`ManageBackendMonitoring` の dev apply 後）
>
> 外れていたら `template.yaml` の `ApiDashboard` とこの節のクエリを直す（`test_monitoring_config.py` の期待値も合わせる）。
>
> **完了条件（マージ前）**: infra の dev apply を確認 → dev にデプロイ → 下の「デプロイ後の確認」を実施 → 上の未確認を結果に書き換える →
> 冒頭の検証状況表の SS-179 の行を ✅ にする。

### 置き場と前提

- 置き場は SAM の `template.yaml`（理由は [ADR-013](../../../docs/adr/ADR-013-observability-adot-application-signals.md) 決定2 の SS-179 追補）。
  CloudFront のアラーム（us-east-1）は Terraform 所有（infra の `live/services/backend-api/monitoring.tf`）で、ここには無い。
  ap-southeast-1 の `sanposcape-<env>-backend-*` のアラームは SAM の所有で、infra 側は同じ接頭辞を作らない。
- **デプロイロールの `ManageBackendMonitoring`（infra の `live/account/sam_deploy.tf`。sanposcape-infra PR #53）が前提。**
  infra の dev への apply より先に backend をマージしない（dev へのデプロイが CloudWatch の AccessDenied で全部止まる）。
  確認コマンドは §3 Phase 0。AccessDenied の対象アクションが許可に無いときは、アクション名と ARN を infra に伝える。
  - 許可の範囲は、名前が `sanposcape-<env>-backend-*` のダッシュボード・アラームの操作とタグ系。`DescribeAlarms` だけは
    `Resource: "*"` の別 statement（名前で絞った許可で CloudFormation のハンドラーの呼び方が通るか確認できなかったため。読み取りのみ）。
    `ListDashboards` は CloudFormation のスタック操作では呼ばれないので許可に無い。SNS の許可も要らない
    （`PutMetricAlarm` は通知先の Publish 権限を確認しない）。
- アラームの通知先は SSM `/sanposcape/<env>/platform/alerting/topic_arn`（platform 層の SNS）。
  メールの購読は infra の `alert_email_addresses` で設定し、確認メールのリンクを踏む必要がある（dev / prod とも確認済み）。
- 名前は必ず `sanposcape-<env>-backend-` で始める（デプロイロールの許可の接頭辞。`test_monitoring_config.py` が固定）。
- **コンソールでダッシュボードを編集しても、次のデプロイで上書きされる。** 試すときは「名前を付けて保存」で別名にする。
- Outputs の `DashboardName` で名前を取れる。コンソールでは CloudWatch > ダッシュボード > `sanposcape-<env>-backend-api`（ap-southeast-1）。
- **prod の前提**: `ManageBackendMonitoring` の prod 適用（SS-185 の prod 適用と同じタイミング。§12）。prod の SSM のトピックは存在する。

### デプロイ後の確認（環境ごとに 1 回）

```bash
# 1) Outputs に DashboardName が出ること、ダッシュボードとアラーム 3 本ができていること
aws cloudformation describe-stacks --stack-name sanposcape-backend-dev --region ap-southeast-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`DashboardName`].OutputValue' --output text
aws cloudwatch describe-alarms --alarm-name-prefix sanposcape-dev-backend-api- --region ap-southeast-1 \
  --query 'MetricAlarms[].{name:AlarmName,state:StateValue,actions:ActionsEnabled}'
# → lambda-errors / lambda-throttles / 5xx の 3 本。dev は actions=false、prod は true

# 2) Application Signals の次元の値が、アラーム・ダッシュボードの Dimension と一致すること。
#    ずれていると 5xx アラームは（TreatMissingData: notBreaching のため）エラー無しで黙って鳴らなくなる。
aws cloudwatch list-metrics --namespace ApplicationSignals --metric-name Fault --region ap-southeast-1 \
  --dimensions Name=Service,Value=sanposcape-backend-api \
  --query 'Metrics[].Dimensions[].{n:Name,v:Value}' --output text | sort -u
# → Environment=<env> / Operation=sanposcape-<env>-backend-api/FunctionHandler / Service=sanposcape-backend-api が含まれること
#   （Fault が無いときは --metric-name Latency でも同じ次元を確認できる）
```

3. コンソールでダッシュボードを開き、全ウィジェットが描画されることを確認する（Q4 の折れ線と、Application Signals の 4 つが特に要確認）。
4. リクエストを何本か流したあと、同じ期間の `SampleCount(Latency)`（Application Signals のリクエスト数）と Lambda の `Invocations` を比べる
   （差があればサンプリングの影響がある。結果を ADR-013 の決定4 に追記する）。
5. prod は、1 回だけ通知の疎通を確認する（下の「アラーム」）。

### ダッシュボードの読み方

名前は `sanposcape-<env>-backend-api`。既定の期間は 7 日。

| 行 | ウィジェット | データ源 | 読み方 |
|---|---|---|---|
| 上段 | 説明 | — | データ源ごとの意味と、自動更新を付けないこと |
| 1 | API 全体: リクエスト数 / 4xx / 5xx、エラー率、レイテンシ（p50/p95/p99） | Application Signals（`ApplicationSignals` 名前空間。`Latency` / `Error` / `Fault`。操作 `<関数名>/FunctionHandler`） | スパン由来。サンプリングの影響を受けるかは未確認（上の検証状況）。Latency に Init（コールドスタート）は含まれない |
| 2 | Lambda: 呼び出し（左軸）/ エラー・スロットル（右軸）、Duration、同時実行数 | `AWS/Lambda` | 全件。Duration には時間予算（25 秒）と Timeout（29 秒）の線（値は `config.py` と `Globals` の二重持ちで、`test_monitoring_config.py` が一致を固定）。同時実行数の線は dev が予約の 5、prod がクォータの 10 |
| 3 | ルート別（Q1）、ルート × ステータス（Q2） | `aws/spans` | ルート（`METHOD /テンプレート`）ごとの件数・p50/p95/p99・4xx/5xx 率。**sampled なスパンだけ** |
| 4 | 直近の 5xx（Q3）、ルート別の件数の時系列（Q4） | `aws/spans` | Q3 の `traceId` から X-Ray / Transaction Search のトレースへ辿る |
| 5 | メモリ（Q5）、コールドスタート（Q6a、Q6b） | Lambda のロググループの REPORT 行 | 全件 |
| 6 | タイムアウト / OOM / ランタイムの異常終了（Q7） | 同上 | スパンが失われるので、ルート別の表には出ない |

ルート別の集計の注意:

- **`aws/spans` 由来の表は sampled なスパンだけ。** 毎秒 1 件を超えたときの扱いは ADR-013 の未解決事項。全件の件数は
  Lambda の `Invocations` と REPORT 行の件数を正とする。
- `GET` / `POST` など **メソッドだけの行**は、どのルートにも一致しなかったリクエスト（404 のスキャナーなど。`http.route` が無い）。
- `GET /health` も 1 行として出る。除外するなら Q1 の `filter` に `` and `attributes.http.route` != '/health' `` を足す。
- **タイムアウト・OOM で落ちたリクエストはスパンが失われる**ため表に出ない。Q7 と `Errors` で見る。
- ハンドラーが例外を投げたときはステータスが欠け、Q1 の 4xx / 5xx に入らない。Lambda の `Errors` 側で拾う。
- 4xx / 5xx の判定は、Logs Insights に `if` / `case` が無いので `floor(status / 400)` と `floor(status / 500)` から 0/1 を作って `sum` している。
  ステータスが 100〜599 の範囲であることが前提（600 以上は 4xx に数えられ、400 未満は 0）。
- 親スパンのステータス属性は旧 semconv の `http.status_code`（`OTEL_SEMCONV_STABILITY_OPT_IN` は未設定。ADR-013 決定6）。
  AWS のドキュメントの例にある `http.response.status_code` ではない。
- エラー率のウィジェットは `100*FILL(fault,0)/req`（欠損は 0 として扱う）。リクエストが無い区間は率も出ない。
- **dev の `aws/spans` には、クエリ除去の前（2026-10-04 の SS-178 の検証）のスパンが残っている**（`http.target` にクエリ文字列、
  `http.route` に生のパスが入った 8 件。テスト値）。`aws/spans` の保持期間（dev は他プロジェクトの設定で 30 日）が切れるまでルート別の表に
  ノイズとして出うる。以降のスパンは `http.target` がルートテンプレートか無しで、UA・IP は空になっている。

### Logs Insights のクエリ（コピー用）

`aws/spans` を対象にするクエリは、コンソールで ap-southeast-1 の Logs Insights を開き、ロググループに `aws/spans` を選ぶ
（`SOURCE` 句でも指定できる）。Lambda のロググループは `/aws/lambda/sanposcape-<env>-backend-api`。
`aws/spans` は dev では他プロジェクトと共有なので、`service.name` で必ず絞る（スキャンは他プロジェクトのスパンにも及ぶが、表示は絞られる）。
親スパンだけを数えるために `kind = 'SERVER'` と `LOCAL_ROOT` で絞る（FastAPI の子スパンが同じ名前を持ち、外すと二重に数える。
`LOCAL_ROOT` だけだと初期化時の Secrets Manager の CLIENT スパンも入る）。
共通の絞り込み（以下 F と書く）:

```
filter `resource.attributes.service.name` = 'sanposcape-backend-api'
  and kind = 'SERVER' and `attributes.aws.span.kind` = 'LOCAL_ROOT'
```

`template.yaml` の `ApiDashboard` には、これと同じクエリを 1 行にして入れてある（サービス名は Sub の変数 `ServiceName`。
`deployment.environment` での絞り込みは入れていない。prod は専用アカウント、dev は sanposcape の dev しか無いため。
入れるなら `` and `resource.attributes.deployment.environment` = '<env>' ``）。**ダッシュボードのクエリとこの節のコピーは二重持ち**で、
片方を直したらもう片方も直す（一致を検査するテストは無い）。

Q1: ルート別の件数・p50/p95/p99・4xx/5xx 率（dev で確認済み）

```
SOURCE 'aws/spans'
| F
| fields name as operation, `attributes.http.status_code` as status, durationNano / 1000000 as duration_ms
| fields floor(status / 500) as is5xx, floor(status / 400) - floor(status / 500) as is4xx
| stats count(*) as requests,
        pct(duration_ms, 50) as p50_ms, pct(duration_ms, 95) as p95_ms, pct(duration_ms, 99) as p99_ms,
        sum(is4xx) as n4xx, sum(is5xx) as n5xx,
        sum(is4xx) * 100 / count(*) as rate4xx_pct, sum(is5xx) * 100 / count(*) as rate5xx_pct
  by operation
| sort requests desc
| limit 100
```

Q2: ルート × ステータス（dev で確認済み）

```
SOURCE 'aws/spans'
| F
| stats count(*) as requests, pct(durationNano / 1000000, 95) as p95_ms by name, `attributes.http.status_code`
| sort requests desc
| limit 200
```

Q3: 直近の 5xx（`traceId` からトレースへ。フィールド名は確認済みだが、5xx のスパンは dev に無く実行結果は未確認）

```
SOURCE 'aws/spans'
| F and `attributes.http.status_code` >= 500
| fields @timestamp, name, `attributes.http.status_code` as status, durationNano / 1000000 as duration_ms, traceId
| sort @timestamp desc
| limit 20
```

Q4: ルート別の件数の時系列（**未確認**: 描画）

```
SOURCE 'aws/spans'
| F
| stats count(*) as requests by bin(1h), name
```

Q5: メモリ（REPORT 行。`@maxMemoryUsed` はバイト。dev で確認済み）

```
SOURCE '/aws/lambda/sanposcape-<env>-backend-api'
| filter @type = 'REPORT'
| stats max(@maxMemoryUsed / 1000 / 1000) as max_mb, pct(@maxMemoryUsed / 1000 / 1000, 95) as p95_mb,
        avg(@maxMemoryUsed / 1000 / 1000) as avg_mb, max(@memorySize / 1000 / 1000) as limit_mb
  by bin(1h)
```

Q6a: コールドスタートの件数と割合（`@initDuration` はコールドスタートの REPORT にだけある）

```
SOURCE '/aws/lambda/sanposcape-<env>-backend-api'
| filter @type = 'REPORT'
| stats count(*) as invocations, count(@initDuration) as cold_starts,
        count(@initDuration) * 100 / count(*) as cold_start_pct
  by bin(1h)
```

Q6b: Init Duration

```
SOURCE '/aws/lambda/sanposcape-<env>-backend-api'
| filter @type = 'REPORT' and ispresent(@initDuration)
| stats pct(@initDuration, 50) as init_p50_ms, pct(@initDuration, 95) as init_p95_ms, max(@initDuration) as init_max_ms
  by bin(1h)
```

Q7: タイムアウト / OOM / ランタイムの異常終了（文言は python3.12 ランタイムの見込み。**未確認**: 実際に起きたときに確かめる）

```
SOURCE '/aws/lambda/sanposcape-<env>-backend-api'
| filter @message like /Task timed out/ or @message like /Runtime exited/ or @message like /Runtime.OutOfMemory/
| stats count(*) as n by bin(1h)
```

### SS-180（ログの JSON 化）との関係

SS-180 では Lambda の `LoggingConfig` を **Text のまま**にした（アプリのフォーマッターが JSON を出す。
理由は ADR-013 決定3 の SS-180 追補、§15）。そのため REPORT 行は従来どおりテキスト形式で、
Q5〜Q7 は変更なし。

Q5〜Q6b は、REPORT 行がテキスト形式（`@type = 'REPORT'` / `@maxMemoryUsed` / `@initDuration`。dev で確認済み）であることを前提にしている。
将来 `LoggingConfig.LogFormat: JSON` にするなら、`type = 'platform.report'` / `record.metrics.*` の形式に変わる可能性がある
（形式は未確認）ので、`ApiDashboard` のクエリを同じ PR で直すこと。直し忘れは
`test_monitoring_config.py`（`test_report_queries_follow_the_log_format_of_the_function`。`Api` と `Globals.Function` の両方の
`LoggingConfig` を見る）が落ちて知らせる。**Q7 は `@message` の文言で引いていて、この見張りの対象外**なので、JSON 化のときに手で見直す。
（アプリのログが JSON になっても Q7 の `Task timed out` / `Runtime exited` は Lambda のプラットフォームが出すテキストの行で、影響を受けない。）

### アラーム

| アラーム名 | 条件（5 分、1 回で判定、欠損は正常扱い） | 疑うこと |
|---|---|---|
| `sanposcape-<env>-backend-api-lambda-errors` | Lambda `Errors` の合計 >= 1 | タイムアウト・OOM・初期化の失敗・ランタイムのクラッシュ・ハンドラーが投げた例外。アプリの未処理例外は 500 の応答になるので通常ここには入らない。Q7 とログを見る |
| `sanposcape-<env>-backend-api-lambda-throttles` | Lambda `Throttles` の合計 >= 1 | 同時実行数の上限（dev は予約 5、prod はクォータ 10）。同時実行数のウィジェットを見る |
| `sanposcape-<env>-backend-api-5xx` | Application Signals `Fault`（5xx と、スパンのステータスが ERROR のもの。次元は `Environment` / `Operation`=`<関数名>/FunctionHandler` / `Service`）の合計 >= 3 | 5xx の件数。外部 API の障害による 503 も含む。Q3 から trace へ |

- **Fault と Lambda の Errors は、ハンドラーが例外を投げたときに両方鳴りうる。** 二重の通知は許容する（片方に寄せると、
  どちらかの検知漏れを見逃すため）。
- **欠損は正常扱い（`notBreaching`）なので、Dimension の値がメトリクスとずれると黙って鳴らなくなる。** デプロイ後の確認の `list-metrics` で値を確かめること。
  `OTEL_SERVICE_NAME` やデプロイ環境名（`Env`）を変えたときも同じ確認をする。
- **5xx を件数から率に切り替える条件**: 件数 3 は、5 分間のリクエストが 60 件のとき 5% に当たる。5 分間のリクエストがふだんから 60 件を
  超えるようになったら、件数 3 は率にして 5% を大きく下回り（誤報が増え）、率で見るほうが意味を持つ。そのときは Metric Math のアラームに変える
  （`IF(req >= 20, 100*FILL(fault,0)/req, 0) > 5` のような式。`req` は `SampleCount(Latency)`）。それまでは件数のまま（リクエストが少ないうちは 1 件で 100% になるため）。
- **dev は `ActionsEnabled: false`**（状態はコンソールで見えるが通知は飛ばない）。`AlarmActions` は dev でも設定してあるので、
  有効にするときは `template.yaml` の `ActionsEnabled` を変えるだけでよい。prod は有効。
- Migrate（手動で invoke する関数）にはアラームを付けない。結果は呼び出した人が受け取り、失敗は §5.2 の手順の中で気づくため。
- prod への通知の疎通確認は、1 回だけ
  `aws cloudwatch set-alarm-state --alarm-name sanposcape-prod-backend-api-lambda-errors --state-value ALARM --state-reason "通知テスト"`
  で試す（次の評価で OK に戻る）。

#### 見送った候補と再検討の時期

prod のベースライン（リリース後 2〜4 週間）が取れてから決める。

- Application Signals の Latency p99 が閾値超過（閾値はベースラインの p99 の 2〜3 倍）
- Lambda の Duration Maximum > 20000ms（時間予算 25 秒の 8 割）
- 4xx 率（401 の期限切れなど正常な 4xx が多く、ベースラインが無いと閾値を決められない）
- Application Signals の SLO（`AWS::ApplicationSignals::ServiceLevelObjective`。デプロイロールの追加権限が要る）
- 5xx を件数から率に変える（条件は上の「5xx を件数から率に切り替える条件」）
- メモリのアラームは作らない（標準メトリクスには Lambda Insights が要る。OOM は `Errors` で拾える）

### 費用の目安と「量が増えたら」

- ダッシュボードは 1 枚 $3/月（アカウントで 3 枚までは無料）、アラームは 1 本 $0.10/月（アカウントで 10 本までは無料）。
  dev は共有アカウントの無料枠を他プロジェクトと分け合う（dev のダッシュボードは他プロジェクトの 1 枚があり、足すと 2 / 3 枚）。
- **Logs Insights のウィジェット（Q1〜Q7）は、開く・更新するたびに期間内のログ全体をスキャンする**（`filter` ではスキャン量は減らない）。
  自動更新は付けないこと（付けたまま開きっぱなしにすると何十倍にもなる）。
- 1 リクエストあたりスパン 8 本 × 約 1.5KB と仮定すると、1,000 リクエスト/日なら 7 日分で約 84MB（1 回 $0.002 程度）、
  10 万リクエスト/日なら 1 回あたり約 34GB（約 $0.2）。**後者の規模になったら**、既定の期間を短くする（`"start": "-PT24H"`）、
  ダッシュボードを「metric だけの概要」と「ルート別」の 2 枚に分ける、フィールドインデックスを検討する。
- Logs Insights の保存済みクエリ（`AWS::Logs::QueryDefinition`）は作らない。`logs:PutQueryDefinition` は
  リソースで絞れない見込みで、共有の dev で他プロジェクトの保存済みクエリを上書き・削除できる権限になるため
  （**要確認**: IAM の Service Authorization Reference）。同じクエリはダッシュボードのウィジェットから
  「Logs Insights で開く」で条件を変えて使える。

## 15. ログ（JSON。ADR-013 / SS-180）

アプリのログは **1 レコード 1 行の JSON** で出る。`LoggingConfig.LogFormat` は Text のままなので、
**START / END / REPORT などプラットフォームの行はテキスト**で、アプリのログだけが JSON になる
（Logs Insights は JSON の行からフィールドを自動で見つける）。決定の理由は
[ADR-013](../../../docs/adr/ADR-013-observability-adot-application-signals.md) 決定3 の SS-180 追補。

### 仕組み

- Lambda: ランタイムが root に付けたハンドラーの**フォーマッターだけ**を `JsonLogFormatter` に差し替える
  （`aws_lambda/runtime_logging.py`。`api.py` の先頭で呼ぶ）。ハンドラーは足しも外しもしない。
  `AWS_LAMBDA_FUNCTION_NAME` があるときだけ行う。
- ローカル（uvicorn）: `configure_logging()` が `sanposcape` ロガーにハンドラーを足す。形式は `LOG_FORMAT`
  （`json` | `console`）。コードの既定は `json`、compose の既定は `console`（読みやすい 1 行表記）。
  **console は ENV が local / test のときだけ許可**され、staging / production で `LOG_FORMAT=console` だと起動時に失敗する。
  Lambda と同じ形で確かめたいときは `LOG_FORMAT=json docker compose up -d --force-recreate api`（[local-development.md](./local-development.md)）。
- **ランタイムを上げるとき**は、ログが JSON のままか（下の「デプロイ後の確認」1）を確認する。
  差し替えは awslambdaric が root にハンドラーを付ける実装に依存している。

### 項目

| 項目 | 出る条件 | 備考 |
|---|---|---|
| `timestamp` / `level` / `logger` / `message` | 常に | UTC・ミリ秒・`Z` 終わり |
| `trace_id` / `span_id` / `trace_sampled` | `TRACING_ENABLED` で current span が有効なとき | `trace_id` は 32 桁の 16 進で、`aws/spans` の `traceId` と同じ形。`trace_sampled=false` なら `aws/spans` に無い可能性がある |
| `aws_request_id` | Lambda の呼び出し中 | REPORT 行の `@requestId` と同じ値 |
| `http_method` / `http_route` | リクエスト処理中 | `http_route` はテンプレート（`/pins/{pin_id}`）。ルート不一致（404）は出ない |
| `user_id` | 認証済みのリクエスト中 | **内部 UUID のみ**。ログイン（`/auth/session`）・リフレッシュの経路は対象外 |
| `log_type` / `http_status_code` / `duration_ms` | アクセスログだけ | `log_type` は `"access"` |
| `exception_type` / `exception_stacktrace` / `exception_sqlstate` | `exc_info` があるとき | 型名（`module.QualName`）、型名とフレームだけのリスト（200 行で打ち切り、`exception_stacktrace_truncated`）、DB 例外の SQLSTATE |
| `exception_message` | `exc_info` があり、かつ ENV が local / test のとき | **staging / production では出ない**（下記） |

- キー名は snake_case。値が無い項目は出さない。`extra=` で渡した属性は許可リストのキーだけ出る。
- アクセスログの `message` は `METHOD path -> status (N.Nms)`。**`message` には生のパスが入る**（`http_route` はテンプレート）。
  クエリ文字列・ヘッダー・ボディは出さない。パスに秘密を載せるルートを足すときは
  `AccessLogMiddleware` の `exclude_paths` かマスクを検討すること。
- ログのレベル: 未処理例外 → ERROR（**全ロガーを通じて 1 リクエストに 1 件**）。例外ハンドラーで変換した 5xx（503 など）→ WARNING。それ以外 → INFO。
- スレッドプールのワーカー（周回ルートの計算、写真の S3 Copy）の中のログには `aws_request_id` / `http_*` / `user_id` が付かない（`trace_id` は付く）。

### 例外メッセージをログに出さない理由とローカルでの再現

psycopg の `DETAIL`（Google の sub など）、pydantic / FastAPI の検証エラーの入力値、httpx / botocore の URL などが
メッセージ経由でロググループ（prod は 400 日保持）に残るため、**staging / production では `exception_message` を出さない**
（ADR-013 決定6）。型名・フレーム（ソースの行を含む）・SQLSTATE で発生箇所は特定できる。
メッセージが要る調査は、`exception_type` とスタックトレースの発生箇所からローカル（`ENV=local`。メッセージ込みで出る）で再現する。
退会（`DELETE /users/me`）後も、ログには内部 UUID の `user_id` が残る（プライバシーポリシー上の扱いは未確認）。

### Logs Insights のクエリ（コピー用）

```
# ログ → トレース: ERROR の一覧（trace_id から aws/spans・X-Ray へ）
SOURCE '/aws/lambda/sanposcape-<env>-backend-api'
| filter level = 'ERROR'
| fields @timestamp, http_method, http_route, exception_type, exception_sqlstate, trace_id, aws_request_id, user_id
| sort @timestamp desc | limit 50

# トレース → ログ: aws/spans の traceId（Q3 など）で引く
SOURCE '/aws/lambda/sanposcape-<env>-backend-api'
| filter trace_id = '<32桁>' or @message like '<32桁>'
| fields @timestamp, level, logger, message | sort @timestamp asc

# REPORT 行（メモリ・時間）と突き合わせる: request id で引く
SOURCE '/aws/lambda/sanposcape-<env>-backend-api'
| filter aws_request_id = '<id>' or @requestId = '<id>'
```

### トレース ⇔ ログの辿り方

- **ログ → トレース**: ERROR などの行の `trace_id` を、`aws/spans` で `filter traceId = '<trace_id>'` と引く。
  X-Ray / Transaction Search のコンソールで開くときは **X-Ray の形**に直す: 先頭 8 桁と残り 24 桁に分け、
  `1-<先頭8桁>-<残り24桁>`（REPORT 行の `XRAY TraceId` と同じ形）。
- **トレース → ログ**: `aws/spans` の `traceId`（ダッシュボードの Q3 など）を 32 桁のまま、上のクエリで引く。
  コンソールのトレース詳細の「ログ」欄（`aws.log.group.names` を見る）に相関ログが**自動で出るかは dev で未確認**。
  出ない場合は上の手動のクエリを正式な手順とする（X-Ray 形式の `xray_trace_id` を足すかは別課題）。
- `trace_sampled` が `false` のログは、対応するトレースが `aws/spans` に無い可能性がある（ログは全件残る）。

### デプロイ後の確認（環境ごとに 1 回。**dev は未実施**）

1. Phase 0 の確認コマンド（§3）が通る（SS-180 は infra の変更を要しない）。
2. Lambda のロググループで、アプリのログが 1 レコード 1 イベントの JSON になり、Logs Insights がフィールドとして見つける:
   `fields level, trace_id, http_route | limit 20`。START / END / REPORT はテキストのまま。
3. ダッシュボードの Q5〜Q6b が今までどおり描ける（REPORT 行が変わっていない）。
4. ログ → トレース: アクセスログの `trace_id` で `aws/spans` を引ける。X-Ray の形で開ける。
5. トレース → ログ: Q3 や Transaction Search で見つけたトレースの `traceId` で、上のクエリでログが引ける。コンソールの「ログ」欄の自動相関の有無を確認し、結果を ADR-013 に書く。
6. `trace_sampled` が `true`、`aws_request_id` が REPORT 行の `@requestId` と一致する。
7. クエリ・UA が残らない: `/explore/...?secret=abc` のようなクエリ付きのリクエストを送り、ロググループを `secret=abc` で検索して 0 件。
8. 500 の経路は dev で意図的に起こす手段が無い（テスト用のルートは作らない）。自然に起きた 500 があれば、ERROR が 1 件で `exception_message` が無いことを確認する。無ければ自動テストとローカルで代える。

### 費用の目安

1 行あたり 50 バイト程度 → 300〜600 バイト程度に増える。1,000 リクエスト/日で月 20MB 前後（取り込みの単価は小さく、保持は prod 400 日 / dev 30 日）。
ダッシュボードにログのウィジェットは足していない（開くたびにロググループ全体をスキャンして課金されるため。§14）。
