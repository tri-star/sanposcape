# ADR-005: backend は Lambda Function URL(AWS_IAM) + CloudFront で公開し、SAM で zip デプロイする

## 日付

2026-09-06

## ステータス

採用（SS-67 で実装）

## コンテキスト

`packages/backend`（FastAPI / Python 3.12 / SQLAlchemy 2 / psycopg3 / Alembic / uv、src レイアウト）を
サーバーレスで dev / prod の AWS アカウントに公開する必要がある。

- インフラ側（別リポジトリ `sanposcape-infra`）は Terraform で CloudFront + WAF + Route53 + ACM +
  Origin Access Control（OAC）を実装済みで、`enable_distribution = false` にした状態で
  Lambda Function URL オリジンの完成を待っている。CloudFront / WAF / Route53 / ACM /
  Secrets Manager の器 / アクセスログ S3 は Terraform 所有であり、SAM では一切作らない。
- [ADR-004](./ADR-004-secrets-management-and-cicd-aws-credentials.md) が
  「Lambda のランタイム秘密は CD パイプラインに通さず、実行ロールで Secrets Manager /
  SSM Parameter Store から直接読む」という方針を先に固定している。本 ADR はその上で
  「Lambda をどう組み立て、どう公開するか」を決める。
- MVP 段階であり、固定費の最小化（NAT Gateway・ALB・API Gateway のような常時課金コンポーネントを
  避ける）が要求されている。
- クライアントは mobile（React Native / Expo）のみで、HTTP の出口は `src/api/client.ts` の
  `customFetch` 1 箇所に集約されている。frontend パッケージは存在しない。
- 本リポジトリ `sanposcape` は **public** である。

## 決定

### 1. 公開経路は Lambda Function URL + CloudFront(OAC/SigV4) とし、API Gateway を使わない

インフラ側が既に Function URL をオリジンとする CloudFront ディストリビューションを実装済みであり、
API Gateway の追加機能（使用量プラン・カスタムオーソライザ等）を現時点で必要としないため。

### 2. パッケージングは zip + `python3.12` ランタイム。コンテナイメージを採らない

ECR リポジトリとイメージのライフサイクル管理が不要になり、SAM が作るリソースが最小になる。
トレードオフとして `psycopg[binary]` の manylinux wheel がビルドホストの arch/glibc に依存するため、
**`sam build --use-container`（ビルドイメージ `public.ecr.aws/sam/build-python3.12`）が実質必須**
になる。ECS へ移す際はビルド経路（zip / Dockerfile）が別物になる点は受容する。

### 3. Lambda 固有のコードは `src/sanposcape/aws_lambda/` にのみ置く（ECS 切替を見据えた制約）

- `main.py` の `create_app()` / `app` は無変更で、ECS では従来どおり
  `uvicorn sanposcape.main:app` で動く。
- `database.py` の DB engine を import 時生成から遅延生成（`get_engine()` / `get_session_factory()`
  の `lru_cache`）に変えたことで、「起動前にシークレットを環境変数へ入れる」という手順は
  Lambda / ECS のどちらでも同じ形になる。ハイドレーション関数（`core/runtime_config.py`）自体も
  `APP_SECRET_ARN` が未設定なら no-op になるため、ECS のエントリポイントから呼んでも害がない。
- 検査方法: `sanposcape.aws_lambda` を import しているのが `template.yaml`（`Handler` の指定）と
  自身のテストだけであること。

### 4. Function URL の `AuthType` は `AWS_IAM`。アクセストークンは `X-App-Authorization` ヘッダーで運ぶ

Function URL の直叩きを IAM で構造的に塞げるため `AWS_IAM` を採用する。`NONE` + 共有シークレット
ヘッダー方式では、Function URL 自体が公開状態になり **WAF を迂回した直叩き**が成立してしまう。

これを選んだことで生じる 3 つの副作用と、その対処は次のとおり。

- **副作用 A: 外部サービスからの Webhook を受けられない。** 相手に SigV4 署名や
  `x-amz-content-sha256` を要求できないため。現時点で Webhook エンドポイントは 0 本、
  Google サインインもネイティブ ID token 方式でコールバックを持たないため実害はない。
  **将来の逃げ道**: そのパスだけ `AuthType=NONE` の別 Lambda を用意し、CloudFront の
  別ビヘイビア（`ordered_cache_behavior`）として生やす。既存の API 本体の認証方式は変えずに済む。
- **副作用 B: ボディを伴うリクエストで、クライアントが `x-amz-content-sha256` を送る必要がある。**
  署名対象のヘッダーであり、CloudFront は他の `x-amz-*` と違いこの値を上書きしない
  （＝ビューアが計算した値がそのままオリジンに届く）ため、クライアントが計算して付けなければならない。
  クライアントは mobile のみで `customFetch` 1 箇所に実装が集約できる。
- **副作用 C（新事実。当初の判断材料に無かった）: CloudFront OAC(`SigningBehavior: always`) が
  ビューアの `Authorization` ヘッダーを上書きする。** インフラ側の OAC 設定は
  `signing_behavior = "always"` で、これは「CloudFront が常にオリジンへの送信リクエストへ
  自分の SigV4 署名を `Authorization` ヘッダーへ入れる」設定である（[AWS 公式ドキュメント](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html)）。
  もう一方の設定 `no-override` は「ビューア自身が Lambda URL ホストに対する SigV4 署名を持っている
  前提」であり、IAM クレデンシャルを配れない public な mobile クライアントでは成立しない。
  結果として **mobile が送る `Authorization: Bearer <access_token>` は Lambda に届かない。**
  `GET /health`（認証不要）はこれが原因で失敗しないため、直接 invoke や `/health` の疎通確認
  だけでは絶対に露見せず、mobile を CloudFront 経由に切り替えた瞬間に認証必須の全エンドポイントが
  401 になる、という発覚しにくい failure mode を持つ。
  **対処**: アクセストークンを `Authorization` 以外の独自ヘッダー `X-App-Authorization` で運ぶ。
  backend（`src/sanposcape/auth/headers.py`）は `X-App-Authorization` → `Authorization` の順で
  `Bearer <token>` を読み取る。ローカル開発 / CI は CloudFront を経由しないため、
  従来どおり `Authorization` のままでも動く（フォールバック）。mobile 側の送出実装は別チケット
  （SS-67 のスコープ外）。

インフラ側の origin request policy（`Managed-AllViewerExceptHostHeader`）はヘッダーを個別列挙しない
ため、`X-App-Authorization` と `x-amz-content-sha256` は追加のインフラ変更なしにオリジンへ転送される。
キャッシュポリシーは `Managed-CachingDisabled`（キャッシュキーが空）であり、ヘッダーによる
キャッシュ分裂（ユーザーごとにレスポンスが分裂する事故）は起きない。

CloudFront がオリジンへの到達時に上書き・付与するヘッダー一覧（インフラ確認済み、
`signing_behavior = "always"` を前提とする）:

| ヘッダー | オリジンに届く値 |
|---|---|
| `Authorization` | CloudFront の SigV4 署名（上記の件） |
| `X-Amz-Date` / `X-Amz-Security-Token` | CloudFront（署名に付随） |
| `Host` | オリジン（Function URL のホスト名）。ビューアの値を転送しない |
| `Via` / `X-Amz-Cf-Id` / `X-Forwarded-For` | CloudFront |
| `x-amz-content-sha256` | **ビューアの値がそのまま使われる**（他の `x-amz-*` と異なり上書きされない。署名対象のため mobile が計算して付ける必要がある） |

自前のヘッダーは `X-App-` 接頭辞で統一する方針をインフラ側と合意済み（`X-App-Authorization` はその1つ目）。

### 5. シークレットは実行時に Secrets Manager から取得し、値を環境変数・CFn パラメータに直接書かない

[ADR-004 決定4](./ADR-004-secrets-management-and-cicd-aws-credentials.md#4-lambda-のランタイム秘密は-cd-パイプラインに通さない)
の具体化。ARN は SSM パラメータ `/sanposcape/<env>/platform/secrets/shared/arn` から
deploy 時に `{{resolve:ssm:...}}` で解決し、`APP_SECRET_ARN` 環境変数として渡す
（実行ロールに `ssm:GetParameter` は不要。account ID がリポジトリに出ないようにする効果もある。
「コンテキスト」のとおり本リポジトリは public のため account ID を書かない方針を取っている）。
取得結果はプロセス内で `lru_cache` によりキャッシュする。

- **受容リスク**: シークレットをローテーションしても、既存の Lambda 実行環境が再生成される
  まで古い値を保持し続ける。TTL は設けていない。再デプロイで確実に反映させる運用とする。
- **トレードオフ（マイグレーション Lambda がシークレット全体を読めること）**: マイグレーション用
  Lambda（`sanposcape-<env>-backend-migrate`）の実行ロールにも同じ
  `secretsmanager:GetSecretValue` を付与している。IAM はシークレット単位でしか権限を絞れず、
  1 つの JSON に複数キーをまとめている構成では**キー単位でのアクセス制御ができない**ため、
  マイグレーション Lambda は `jwt_signing_key` や `google_maps_server_api_key` も読める状態になる。
  2 つの Lambda が同じリポジトリ・同じデプロイ経路・同じ信頼境界にあることを踏まえ、
  **現時点ではこれを許容する**。器を分けるとコンテナ 1 つあたりの固定費が乗り、
  1 コンテナに集約した本構成の判断そのものと矛盾するためである。将来「マイグレーションは
  DB 資格情報しか見えない」を担保したくなった場合は、
  `/sanposcape/<env>/services/backend-api/db` のような**サービス層の別コンテナ**を新設し、
  DB 接続文字列だけをそちらへ切り出す、という逃げ道を残す。

### 6. アプリの `ENV` はテンプレートの `Mappings` で変換し、`config.py` の `Literal` を広げない

Terraform とのスタックパラメータ契約は `Env`(dev/prod) だが、アプリ内部の起動時バリデーション
（`config.py` の許可リスト方式 fail-safe）は `ENV`(local/test/staging/production) を見ている。
過去に staging が許可リストの検証対象から漏れて認証バイパスになった経緯があり、`Literal` の値域を
安易に増やすと同じ罠を再演するリスクが上がる。そのため `config.py` は変更せず、
`template.yaml` の `Mappings`（`dev → staging` / `prod → production`）で変換する。

副作用として、dev アカウントの Lambda のログ・メトリクスには `ENV=staging` と出る。

### 7. Lambda は VPC に入れない

Neon / Google JWKS / Google Maps API はすべてインターネット経由で到達する。VPC に入れると
NAT Gateway の固定費（月額 $35 程度〜）と ENI アタッチに伴うコールドスタート増加が乗るだけで
得るものがない。

### 8. in-process キャッシュ / レート制限の Lambda 多重起動は、本 ADR では受容する

Google Maps のレスポンスキャッシュ（`integrations/google_maps/cache.py`）と `ExploreRateLimiter`
（`maps/rate_limit.py`）は Lambda インスタンスごとに独立するため、インスタンス数が増えるほど
キャッシュヒット率が下がり、レート制限の実効値がインスタンス数倍になる。

- **緩和策**: `ReservedConcurrentExecutions` で実効倍率の上限を固定する。加えて Google Cloud 側の
  クォータ上限で費用に天井を設ける（ADR-004 決定3 と同じ考え方）。
- **prod だけ緩和策が効かない期間があるリスク**: prod アカウントは新規発行のため Lambda の
  同時実行数クォータが AWS の初期値（10）のままで、AWS は「予約によって未予約が 100 を下回る
  変更」を拒否するため、**このクォータが上がるまでは prod でどんな値の
  `ReservedConcurrentExecutions` も設定できない**（`InvalidParameterValueException`）。
  このため `template.yaml` は `Env` 別に分岐し、prod では属性ごと `AWS::NoValue` で落としている。
  クォータ引き上げはインフラ側から申請済みで承認待ちである。
  **引き上げが承認された直後が最も危険な時間帯になる**（上限だけ 1000 に上がり、
  予約がまだ入っていない状態では in-process キャッシュ / レート制限の分裂が一気に広がりうる）。
  この時間帯を作らないよう、**クォータ引き上げの反映と `ReservedConcurrentExecutions` の投入を
  同じタイミングで行う**運用をインフラチームと合意済み。
  なお、上限が 10 のままである間はアカウント全体で API 本体とマイグレーション Lambda を合わせて
  最大 10 インスタンスが天井になるため、予約が無くてもキャッシュ分裂の実害は小さい。
- 外部ストア（DynamoDB 等）への移行は別課題とする。移行すると SAM が作るリソースが増え、
  インフラ側への申告事項も増えるため、デプロイ基盤の確立を先行させる判断をした。

### 9. Alembic マイグレーションは専用 Lambda の手動 invoke で実行する。API 本体では走らせない

API 本体のハンドラ / lifespan で `upgrade head` を走らせる案は、コールドスタートのたびに走り、
同時実行で競合し、失敗時にヘルスチェックまで巻き込むため採らない。デプロイフックでの自動実行も、
スキーマ変更とデプロイを不可分にし失敗時のロールバックを難しくするため採らない。

- マイグレーション Lambda は API 本体と**同じビルド成果物（同じ `CodeUri`）**を使う。
  デプロイされたコードとマイグレーションのリビジョンが必ず一致する。
- **direct（非 pooled）DSN を使う。** API 本体はシークレットの `neon_dsn`（pooled、
  Neon の PgBouncer 経由）をそのまま使うが、Neon 公式は pooled 接続（PgBouncer transaction mode）
  を使ってはいけない用途として **Schema migrations** を明示している。transaction mode では
  `SET` / `RESET`（セッション変数。特に `SET search_path` がトランザクションごとにリセットされる）・
  `LISTEN` / `NOTIFY`・SQL レベルの `PREPARE` / `DEALLOCATE`・セッションレベルの advisory lock
  が使えない。そのためシークレットに **`neon_dsn_unpooled`** キーを追加し、マイグレーション Lambda
  だけがそちらを読む構成にした。ホスト名から `-pooler` を機械的に除去して direct 相当を作る案は、
  Neon のホスト命名規則への暗黙依存になり命名が変わった際にマイグレーション実行時にだけ壊れる
  （発覚が遅い）ため採らない。

### 10. アーキテクチャは x86_64

arm64 は稼働コストが約 20% 安いが、`--use-container` ビルドをローカル（WSL2/x86）で行う場合に
qemu エミュレーションになり実用的でない。CI 上でネイティブ arm64 ビルドが組めるようになった時点の
最適化候補として記録する。

### 11. SnapStart は有効化しない

Python 3.12 では利用可能だが、init 時にシークレットをハイドレートする現構成ではスナップショットに
秘密値が焼き込まれてしまう。採用するなら `after_restore` ランタイムフックへハイドレーション処理を
移設することが前提になり、今回のスコープでは行わない。

## 検討した選択肢

### 選択肢1: API Gateway (HTTP API) を挟む

- **却下理由**: リクエスト課金と 1 層増える点に見合う機能（使用量プラン、カスタムオーソライザ等）
  を現時点で必要としない。インフラ側は既に Function URL オリジンで CloudFront を実装済みであり、
  API Gateway を挟むと二重管理になる。

### 選択肢2: ALB + Lambda

- **却下理由**: ALB の固定費（月額 $16 程度〜）が MVP のコスト方針に合わない。

### 選択肢3: コンテナイメージ（既存の Dockerfile を流用し、Lambda コンテナイメージと ECS タスクで
同一イメージを使う）

- **メリット**: ECS 移行時にビルド経路が完全に共通化できる。
- **却下理由**: ユーザー判断により不採用。ECR リポジトリとイメージのライフサイクル管理という
  SAM 管理外の運用が増える。zip 方式でも「Lambda 固有コードを `aws_lambda/` に閉じる」という
  ECS 移植性の制約自体は満たせるため、コンテナイメージまでは必要ないと判断した。

### 選択肢4: `AuthType=NONE` + 共有シークレットヘッダー（インフラ資料の代替案）

- **メリット**: `Authorization` の上書きも `x-amz-content-sha256` の要件も両方消える。
- **却下理由**: Function URL が公開状態になり、**WAF を迂回した直叩き**が成立してしまう
  （防御が「共有シークレットの秘匿」だけに落ちる）。加えて Terraform モジュール側の改修が必要になる。
  決定4 の新事実（`Authorization` 上書き）が判明した後にユーザーへ再確認したが、
  `AWS_IAM` 維持のほうが安全性で優位という判断を維持した。

### 選択肢5: CloudFront Functions（ビューアリクエスト）で `Authorization` → `X-App-Authorization` に
リネームする

- **メリット**: mobile 側のヘッダー名変更が不要になる。
- **却下理由**: ローカル開発と CI は CloudFront を経由しないため、backend 側に
  `X-App-Authorization` を読む実装はどのみち必要になり、「mobile を無変更にできる」利点が
  成立しない。エッジに構成要素（CloudFront Functions）を追加で持つ意味がなく、インフラ側とも
  不採用で合意した。

### 選択肢6: pooled 接続のホスト名から `-pooler` を機械的に除去し、単一の DSN で direct/pooled を
使い分ける

- **却下理由**: 決定9のとおり、Neon のホスト命名規則という暗黙の外部契約に依存することになり、
  命名が変わった場合にマイグレーション実行時にだけ、かつ発覚が遅い形で壊れる。専用のシークレット
  キー（`neon_dsn_unpooled`）を Neon 側の値として明示的に持つほうが安全である。

## 決定理由

- Function URL + CloudFront(OAC) は、固定費をほぼゼロに保ちながら WAF・カスタムドメイン・
  アクセスログといった CloudFront の恩恵を受けられる構成であり、MVP のコスト方針と両立する。
- `AuthType=AWS_IAM` は Function URL の直叩きを構造的に防げる一方で「ビューアの `Authorization`
  ヘッダーが上書きされる」という調査で判明した制約を持つ。この制約は `X-App-Authorization` という
  独自ヘッダー 1 本の追加で吸収でき、`NONE` + 共有シークレット方式に切り替えて防御を弱めるより
  安全側に倒せると判断した。
- zip + `--use-container` は、コンテナイメージ運用（ECR のライフサイクル管理）を持ち込まずに
  `psycopg[binary]` の manylinux 互換性を担保できる、現時点で最小構成の選択である。
- シークレットの実行時取得（CD を通さない）は ADR-004 の方針をそのまま継承する形であり、
  新たな判断を必要としない。
- Alembic を専用 Lambda の手動 invoke にする設計は、API 本体の可用性とスキーマ変更のタイミングを
  分離し、失敗時の切り分けを容易にする。

## 影響

### ポジティブな影響

- 固定費がほぼゼロ（NAT Gateway・ALB・API Gateway のいずれも持たない）。
- CloudFront / WAF の恩恵（キャッシュ、DDoS 緩和、カスタムドメイン）をそのまま受けられる。
- ランタイム秘密が CI/CD パイプラインを一度も通過しない（ADR-004 の方針をそのまま実現）。
- Lambda 固有コードが `aws_lambda/` の 1 パッケージに閉じており、ECS へ切り替える際の
  影響範囲が把握しやすい。

### ネガティブな影響・トレードオフ

- コールドスタート（FastAPI + SQLAlchemy の import に 1〜3 秒程度）が発生し、間欠的な
  リクエストで顕在化しやすい。SnapStart は決定11の理由により見送っている。
- mobile 側に CloudFront 由来の実装（`x-amz-content-sha256` の付与、`X-App-Authorization`
  ヘッダーへの切り替え）が漏れ、backend 単独では完結しない。
- in-process キャッシュ / レート制限のヒット率がインスタンス数に応じて下がる。prod は
  クォータ引き上げが完了するまで `ReservedConcurrentExecutions` による上限固定ができず、
  決定8のとおり一時的にこのリスクが顕在化しうる。
- マイグレーション Lambda がシークレット全体（DB 接続情報以外も含む）を読める状態にある
  （決定5参照）。
- シークレットのローテーションが Lambda 実行環境の再生成まで反映されない。
- dev アカウントの Lambda のログ・メトリクスに `ENV=staging` と表示される（決定6の副作用）。

### 移行・対応が必要な事項

以下は本 ADR では方針決定のみで、実施は別タスクとする。

- [ ] シークレットへ `neon_dsn_unpooled`（direct DSN）を投入する。マイグレーション Lambda は
      未投入の間 `MigrationConfigError` で明示的に失敗する設計になっている。
- [ ] prod の Lambda 同時実行数クォータ引き上げの承認を待ち、承認後速やかに
      `ReservedConcurrentExecutions` を prod にも投入する（決定8の「最も危険な時間帯」を作らない）。
- [ ] prod のシークレット（`/sanposcape/prod/shared`）に値を投入する。
- [ ] mobile 側の CloudFront 対応（`x-amz-content-sha256` の付与、`X-App-Authorization` への
      切り替え）を別チケットで実施し、`EXPO_PUBLIC_BACKEND_API_URL` を CloudFront のホスト名に
      切り替える前に完了させる。
- [ ] in-process キャッシュ / レート制限の外部ストア（DynamoDB 等）への移行を別課題として検討する。
- [ ] SAM デプロイの CI 化（OIDC ロールの整備後）。

## 関連情報

- [ADR-004: シークレットの保管先は「消費者」で決め、CI から AWS への認証は OIDC を使う](./ADR-004-secrets-management-and-cicd-aws-credentials.md)
- [ADR-002: 認証は Google 直結 + モバイル public client + backend 自前セッショントークン](./ADR-002-auth-google-signin-and-stub-strategy.md)
- [packages/backend/docs/deployment.md](../../packages/backend/docs/deployment.md) — 本 ADR に基づく実際のデプロイ手順
- [Restrict access to an AWS Lambda function URL origin (AWS 公式ドキュメント)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html) — OAC の `SigningBehavior`、`x-amz-content-sha256` の要件、権限付与の 2 コマンド
- [Connection pooling (Neon 公式ドキュメント)](https://neon.com/docs/connect/connection-pooling) — pooled/direct 接続の使い分けと、Schema migrations が direct を要する理由
