# backend デプロイ手順（AWS SAM）

`packages/backend` を AWS Lambda（zip + `python3.12`）+ Lambda Function URL（`AuthType=AWS_IAM`）に
載せ、AWS SAM で dev / prod の AWS アカウントへデプロイする手順。方式決定の背景・却下案は
[ADR-005](../../../docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md) を参照。

> **検証状況（2026-09-06 時点）**
>
> | 手順 | 状況 |
> |---|---|
> | `sam validate --lint` | ✅ 検証済み |
> | `make lambda-requirements` → `sam build --use-container` | ✅ 検証済み（成果物 88MB。`psycopg_binary` の manylinux `.so` と `.env` 非混入も確認） |
> | `sam deploy --config-env dev` | ✅ 検証済み（dev スタック `CREATE_COMPLETE`。契約値・タグ・ログ保持期間まで確認） |
> | `aws lambda invoke`（直接）で `/health` | ✅ 200 `{"status":"ok"}`。シークレット取得の実経路も通過 |
> | Function URL 直叩き | ✅ 403 `{"Message":"Forbidden"}` |
> | マイグレーション Lambda（§5.2） | ⚠️ **未検証**（初回実行で成果物の配置不備が判明し修正済み。再デプロイ後に要確認） |
> | `sam local invoke`（§4 手順5） | ⚠️ **未検証**。`APP_SECRET_ARN` に各自の dev シークレット ARN を埋める必要がある |
> | CloudFront 経由（§6.2） | ⚠️ **未検証**。インフラ側の `enable_distribution = true` 待ち |
> | prod へのデプロイ | ⚠️ **未実施**。Lambda 同時実行数クォータの引き上げとシークレット値の投入が前提 |

## 1. 前提

- AWS CLI が設定済みで、dev / prod いずれかの AWS アカウントのクレデンシャルを
  `AWS_PROFILE` 等で切り替えられること。
- リージョンは **`ap-southeast-1`** 固定。
- Docker が利用可能であること（`sam build --use-container` が内部で使う）。
- ローカル開発用の `docker compose` 環境とは別物。デプロイ作業はホストで `sam` / `aws` CLI を
  直接実行する（`docker compose exec api ...` ではない）。

### dev / prod の対応表

| 項目 | dev | prod |
|---|---|---|
| SAM スタック名 | `sanposcape-backend-dev` | `sanposcape-backend-prod` |
| API 関数名 | `sanposcape-dev-backend-api` | `sanposcape-prod-backend-api` |
| マイグレーション関数名 | `sanposcape-dev-backend-migrate` | `sanposcape-prod-backend-migrate` |
| アプリの `ENV` | `staging` | `production` |
| ロググループ保持期間 | 30日 | 400日 |
| `ReservedConcurrentExecutions` | Api=5 / Migrate=1 | 未設定（後述） |

**`Env=dev` はアプリの `ENV=staging` に対応する。** `template.yaml` の `Mappings`
（`EnvToAppEnv`）で変換しており、`config.py` の `Literal["local","test","staging","production"]`
はこのために広げていない（[ADR-005 決定6](../../../docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md#6-アプリの-env-はテンプレートの-mappings-で変換し-configpy-の-literal-を広げない)）。
dev アカウントの CloudWatch Logs には `ENV=staging` と出る。

## 2. 責務境界

| 作るもの | 所有者 |
|---|---|
| Lambda 関数 2 つ（API 本体 / マイグレーション）、実行ロール、CloudWatch ロググループ 2 つ、API 本体の Function URL | **SAM**（このリポジトリ） |
| CloudFront ディストリビューション、WAF、Route53、ACM、OAC、Secrets Manager の器、アクセスログ S3 | **Terraform**（別リポジトリ `sanposcape-infra`） |
| CloudFront からの呼び出し許可（`lambda:InvokeFunctionUrl` / `lambda:InvokeFunction`） | **Terraform**（`enable_distribution = true` の apply 時に付与） |

**デプロイ順は常に SAM → Terraform。** SAM が Lambda 関数と Function URL を作った後でないと、
Terraform 側が CloudFront のオリジンとして参照できない。

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

# シークレットのキー名だけを確認する（値は絶対に出さない）
aws secretsmanager get-secret-value --secret-id <上記で得たARN> \
  --query SecretString --output text | python3 -c "import sys,json; print(*sorted(json.load(sys.stdin)), sep='\n')"
# → neon_dsn / neon_dsn_unpooled / jwt_signing_key / google_oauth_client_id /
#   google_maps_server_api_key が揃っていること（google_oauth_client_secret は未使用）

# 同名のロググループが既に存在しないこと（存在すると明示定義が CREATE_FAILED になる）
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/sanposcape-dev-backend \
  --region ap-southeast-1
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

# 4) 展開後サイズの確認（250MB 制限に対する余裕。uvicorn[standard] を含むため要注意）
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
> `template.yaml` が宣言しているのは `ENV` / `AUTH_MODE` / `MAPS_MODE` / `DB_POOL_SIZE` /
> `DB_MAX_OVERFLOW` / `DB_POOL_RECYCLE_SECONDS` / `APP_SECRET_ARN` の 7 つだけ。
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

# Outputs（FunctionUrl / FunctionName の 2 つが出ること）
aws cloudformation describe-stacks --stack-name sanposcape-backend-dev \
  --region ap-southeast-1 --query 'Stacks[0].Outputs'

# タグ（Project=sanposcape / Env=dev / ManagedBy=sam / Repo=sanposcape）
aws lambda list-tags --resource <上記で得た関数の ARN>
```

### 6.2 Phase 5（インフラ側 `enable_distribution = true` の apply 後）

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

**あわせて確認する完了条件**:

- マイグレーション Lambda の invoke が成功し、Neon にスキーマが適用されている（§5.2）
- ロググループ `/aws/lambda/sanposcape-dev-backend-api` の `RetentionInDays` が 30
- `docker compose up -d` からの既存ローカル開発フローが従来どおり動く
- backend CI（lint / test / migration smoke）が緑

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
| `prepared statement "..." already exists` | Neon の PgBouncer とプロトコルレベルの prepared statement が想定外に衝突した | `DB_DISABLE_PREPARED_STATEMENTS=true` を該当関数の環境変数に設定して再デプロイする（§9 参照） |
| CloudFront 経由だと全エンドポイントで 401（`/health` は 200） | mobile 側が `Authorization` ヘッダーで送っている（CloudFront に上書きされる） | mobile 側が `X-App-Authorization` を送るよう実装されているか確認する（ADR-005 決定4） |
| CloudFront 経由が全部 403（`/health` を含む） | CloudFront からの呼び出し許可（`lambda:InvokeFunctionUrl` / `lambda:InvokeFunction`）が無い、または distribution ID が不一致 | 下記の `get-policy` で確認する。**この許可は Terraform 側が付与するもので、SAM 側の対応は無い** |
| `Runtime exited with error: exit status 1` / `Init failed` としか見えず、原因が分からない | init 時の例外報告そのものが壊れている（下記「init 失敗時にエラー報告自体が壊れる」を参照） | **CloudWatch Logs の `INIT_START` 直後の `[ERROR]` 行を読む**。真の原因はそこに出ている |

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
CloudWatch Logs の `INIT_START` の直後に出る次のような `[ERROR]` 行を読めば原因が分かる。

```
[ERROR] Settings validation failed at startup: [...]
[ERROR] ValidationError: [...]
```

これは `src/sanposcape/aws_lambda/api.py` が `ValidationError` を捕捉した際に
`exc.errors(include_input=False, include_url=False)` で**不足フィールド名だけを先に
ERROR ログへ出してから再送出する**設計になっているため（値には秘密情報が含まれ得るので
`include_input=False` にしている）。`post_init_error` の `UnicodeEncodeError` に惑わされず、
まずこの ERROR ログを確認すること。

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
- IAM ポリシー（`secretsmanager:GetSecretValue`）が実際に足りているか
- Neon への実接続・レイテンシ・コールドスタート時間・29 秒タイムアウトの境界
- `ReservedConcurrentExecutions` の効果

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
