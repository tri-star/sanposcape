# LP のデプロイ

`packages/lp` のビルド成果物（`dist/`）を S3 にアップロードし、CloudFront のキャッシュを削除して公開する。
ワークフローは `.github/workflows/lp-deploy.yml`。配信面（S3 バケット・CloudFront・CloudFront Function・
デプロイ用 OIDC ロール・Route53 レコード）は sanposcape-infra の `live/services/lp`（SS-74）が持つ。

| 環境        | URL                         | 起動                                                                                           |
| ----------- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| development | https://dev.sanposcape.com/ | `packages/lp/**` を含む main への push で自動。Actions の「Run workflow」で任意の ref からも可 |
| production  | https://sanposcape.com/     | Actions の「Run workflow」（main のみ）→ Environment `production` の承認                       |

`www.sanposcape.com` と `*.cloudfront.net` へのアクセスは、CloudFront Function が正規ホストへ 301 でリダイレクトする。

## 流れ

```
prepare（環境と公開 URL を決める。production は main 以外を拒否）
  → ci（lp-ci.yml: scripts/lp-tools の単体テスト / astro check / Prettier / build / インライン混入の検査）
  → build（LP_SITE_URL・PUBLIC_LP_ENV を渡して astro build。id-token なし）
  → deploy（environment 付き。OIDC で AssumeRole → S3 へアップロード → invalidation → 掃除 → 疎通確認 → 旧ハッシュの引退（有効な環境のみ））
  → release（production のみ。lp/vX.Y.Z タグと GitHub Release）
```

### deploy job の中身

1. SSM（ap-southeast-1）から契約値を読み、ログに出ないよう `add-mask` する。
   - `/sanposcape/<env>/services/lp/bucket_name`
   - `/sanposcape/<env>/services/lp/distribution_id`
2. `_astro/`（ハッシュ付き）を `Cache-Control: public, max-age=31536000, immutable` でアップロードする。
   旧ハッシュの削除を有効にしている環境では、続けて今回のビルドにあるのに引退のタグが付いているもの（ロールバックで再び参照されたもの）からタグを外す（下の「`_astro/` の旧ハッシュ」）。
3. それ以外（HTML・`404.html`・`public/` の素材・`robots.txt`・sitemap）を `Cache-Control: public, max-age=0, s-maxage=86400` でアップロードする。
4. `/*` を invalidation し、完了を待つ。
5. 3 と同じ範囲（`_astro/` 以外）を `--delete` 付きで同期し、消えたページなどの古いファイルを削除する。
6. 公開 URL が 200 を返すことを確認する。
7. 旧ハッシュの削除を有効にしている環境では、今回のビルドに無い `_astro/` に引退のタグを付ける（失敗したら警告を出し、10 分で打ち切られたらステップが失敗の印とエラーの注記になるが、どちらもデプロイは成功扱い。続きは次のデプロイで行う）。

「上げる → キャッシュ削除 → 掃除」の順にしているのは、エッジに古い HTML が残っている間に、そこから参照されるファイルを消さないため。
消しすぎた場合は、バケットのバージョニング（旧バージョンは 30 日保持）から戻せる。

### `_astro/` の旧ハッシュ

`_astro/` の旧ハッシュのファイルは、デプロイの掃除（`--delete`）では削除しない。デプロイ前から開いたままのタブは古い HTML を表示しているので、
遅延読み込みの画像などを後から旧ハッシュの名前で取りに来るため（invalidation はブラウザが既に持っている HTML には効かない）。
増える量はビルド 1 回で最大 1.6MB 程度（画像を変えなければ CSS / JS の数十 KB）で、費用はほぼかからない。

Environment Variables `LP_RETIRE_STALE_ASSETS` を `true` にした環境では、猶予期間を置いてから削除する（SS-166。ADR-012 の SS-166 追補）。
未設定なら残し続ける。

- デプロイが、今回のビルドに無い `_astro/` のオブジェクトを同じキーへコピーし直し（作成日時を引退の日にする。Content-Type・Cache-Control は保つ）、
  タグ `lp-retired=true` を付ける。既にタグが付いているものはコピーし直さない（作成日時が延びて期限が来なくなるため）。
- infra の S3 Lifecycle ルール（prefix `_astro/` かつタグ `lp-retired=true`）が、タグを付けてから猶予期間の後に削除する。
  バケットはバージョニングが有効なので、削除の後も旧バージョンから 30 日間は戻せる。
- ロールバックなどで再び参照されたアセットは、`_astro/` を上げた直後にタグを外す（タグが外れれば Lifecycle の対象から外れる）。
- 処理は `scripts/lp-tools/retire-stale-assets.mjs`（`restore` / `retire`）。単体テストは lp-ci が回す。

`/*` の invalidation は 1 パスとして数えられ、月 1,000 パスまで無料。invalidation に失敗しても、`s-maxage=86400` により
HTML は最大 1 日でエッジから入れ替わる。

## 前提（初回のみ）

順番はインフラ側の合意（SS-74）に従う。

1. sanposcape-infra の `live/services/lp` を dev に apply する（`git push origin main:refs/heads/deployments/dev/services-lp`）。
2. GitHub の Environment `development` に Variables `AWS_LP_DEPLOY_ROLE_ARN`
   （`arn:aws:iam::<dev account>:role/sanposcape-dev-lp-deploy`。値は infra 側の `terraform output` で確認）を設定する。
3. このワークフローを dev で実行して確認する（下の「確認項目」）。
4. `live/services/lp` を prod に apply する（`git push origin main:refs/heads/deployments/prod/services-lp`）。
   apply から初回デプロイまでの数分間、`sanposcape.com` は 404 を返す。
5. Environment `production` に `AWS_LP_DEPLOY_ROLE_ARN`（`sanposcape-prod-lp-deploy`）を設定する。
   Deployment branches が main のみ・Required reviewers が付いていることを確認する（backend-deploy.yml と共用の Environment）。
6. main から production を指定して実行し、承認する。

ロール ARN 以外の値（バケット名・distribution ID）はリポジトリにも GitHub にも置かない。

### `_astro/` の旧ハッシュの削除を有効にする（SS-166）

環境ごとに、次の順で行う（dev で確かめてから prod）。

1. sanposcape-infra の `live/services/lp` に次を入れて apply する。
   - Lifecycle ルール: filter が prefix `_astro/` かつタグ `lp-retired=true`、Expiration が猶予期間の日数（推奨 30 日）。
   - デプロイ用ロール `sanposcape-<env>-lp-deploy` に、`arn:aws:s3:::<bucket>/_astro/*` への `s3:GetObject`（head-object とコピー元の読み取り）・
     `s3:GetObjectTagging`・`s3:PutObjectTagging`・`s3:DeleteObjectTagging`（バケットの既定の暗号化が SSE-KMS なら、その鍵の `kms:Decrypt`・`kms:GenerateDataKey` も）。
2. GitHub の Environment に Variables `LP_RETIRE_STALE_ASSETS` = `true` を設定する。
3. Run workflow でデプロイし、「Restore re-referenced hashed assets」と「Retire stale hashed assets」が skip されずに実行されたこと、Retire のログの件数、警告が出ておらずステップが失敗の印（打ち切り）になっていないことを確かめる。
   1 回目はそれまでに溜まった旧ハッシュをすべて引退させるので、件数が多く時間がかかる。
4. Lifecycle ルールの filter が prefix とタグの両方（AND）になっていること、引退させたオブジェクトのタグ・Content-Type・Cache-Control を確かめる。
   filter が prefix だけだと使用中のアセットも年齢で消え、タグだけだと `_astro/` 以外も対象になる。

```bash
aws s3api get-bucket-lifecycle-configuration --bucket "$BUCKET"   # Filter.And が Prefix "_astro/" と Tags [lp-retired=true]
aws s3api list-objects-v2 --bucket "$BUCKET" --prefix _astro/ --query 'Contents[].[Key,LastModified]' --output text
aws s3api get-object-tagging --bucket "$BUCKET" --key "_astro/<今回のビルドに無いファイル>"   # lp-retired=true
aws s3api head-object --bucket "$BUCKET" --key "_astro/<今回のビルドに無いファイル>"          # ContentType・CacheControl が元のまま
aws s3api get-object-tagging --bucket "$BUCKET" --key "_astro/<今回のビルドのファイル>"       # lp-retired が無い
```

止めるときは、先に Lifecycle ルールを外してから `LP_RETIRE_STALE_ASSETS` を消す。逆の順にすると、デプロイがタグを外さなくなり、
ロールバックで再び参照されたアセットが引退のタグを付けたまま期限で消える。

## 確認項目

```bash
SITE=https://dev.sanposcape.com
curl -sI "$SITE/"                       # 200。セキュリティヘッダー（CSP 等）と dev のみ X-Robots-Tag: noindex
curl -sI "$SITE/no-such-page/"          # 404（中身は 404.html）
curl -sI "$SITE/index.html"             # Cache-Control: public, max-age=0, s-maxage=86400
curl -sI "$SITE/_astro/<任意のファイル>"  # Cache-Control: public, max-age=31536000, immutable
curl -sI "$SITE/privacy/"               # 200（アプリ内リンクと App Store Connect に登録する恒久 URL）
curl -sI "$SITE/privacy"                # 301、Location が末尾 / 付きの /privacy/
curl -sI "$SITE/terms/"                 # 200（アプリ内リンクに登録する恒久 URL。SS-187）
curl -sI "$SITE/support/"               # 200（App Store Connect の Support URL に登録する恒久 URL。SS-214）
curl -sI "$SITE/privacy/2026-10-24/"    # 200（改定前のポリシーの版。/privacy/ の案内と改定履歴からリンクする恒久 URL。SS-248）
curl -sI "$SITE/terms/2026-10-24/"      # 200（改定前の規約の版。/terms/ の案内と改定履歴からリンクする恒久 URL。SS-222）
curl -s "$SITE/sitemap-0.xml"           # /privacy/2026-10-24/・/terms/2026-10-24/ のような改定前の版と /i/ が含まれないこと
curl -sI "$SITE/i/"                     # 200（招待リンクの受け皿。SS-250）
curl -sI "$SITE/.well-known/apple-app-site-association"  # 200、Content-Type: application/json、リダイレクトなし
curl -sI "$SITE/.well-known/assetlinks.json"             # dev は 200（application/json）。prod は Android の値を足すまで 404
```

production では追加で次を確認する。

```bash
curl -sI https://www.sanposcape.com/    # 301、Location: https://sanposcape.com/
curl -sI https://sanposcape.com/        # 200、X-Robots-Tag が付かない
curl -s https://sanposcape.com/robots.txt  # Allow と Sitemap の行
```

ブラウザでは、開発者ツールのコンソールに CSP 違反が出ていないことも確認する。

## ロールバック

過去のコミットを ref に指定して再デプロイする。

- development: Run workflow で ref に過去のコミット（を指すブランチやタグ）を指定する。
- production: main からしか起動できないため、revert のコミットを main に入れてから実行する。
  revert のコミットは前回タグの子孫なので、release job は通常どおり次のバージョン（`fix` なら patch）のタグを作る。

## 注意

- **pull_request / pull_request_target トリガーを足さない。** public リポジトリのため、fork の PR からデプロイ経路
  （Environment と OIDC）に到達され得る。ロールの trust も `environment:<名前>` の subject しか許していない。
- **Environment は backend と共用している。** `environment: development` を付けた job は、どのワークフローからでも
  sam-deploy・feature-flags・lp-deploy のロールを AssumeRole できる。分けたくなったら LP 専用の Environment を作り、
  infra 側の tfvar で trust の Environment 名を変える。
- **（一時的）トップページは、ストアの版でまだ使えない機能を紹介している（SS-261）。** production へのデプロイは、次の両方がそろってから行う。
  1. 地図の共有（招待。SS-249・SS-250）と「ピンの場所に移動」（SS-246）を含む version が、ストアで公開されている（2026-11-04 時点のストアの版 1.0.0 には無く、1.0.0 には OTA も配れない。[リリース運用手順](../../../docs/release-runbook.md)）。
  2. フラグ `map_invitation` を本番で ON にしている（ON はプライバシーポリシーの施行日 2026-12-02 の後の予定。`packages/mobile/src/config/featureFlags.ts`）。

  これは「本番の LP はいつでも main からデプロイできる」（リリース運用手順 §7.5）の一時的な例外。そろう前にポリシーの改定などで production に出す必要があるときは、
  先にトップページの紹介（`Together.astro`・`Steps.astro` の STEP 03・`Pins.astro` の「その場所へ移動」・`Hero.astro` のタグ・`index.astro` の description）をどうするかを決める。
  両方そろって production に出したら、この項目を消す（Plane SS-262）。

- dev をブランチで確認している最中に `packages/lp/**` を含む main への push があると、dev は main の内容に戻る。
- dev の自動デプロイは `packages/lp/**` とこのワークフローの変更だけで起動する。ロックファイルだけが変わる依存の更新
  （Dependabot の推移的依存など）は自動では出ないので、必要なら Run workflow で dev に出す。
- 初回は、infra の apply と `AWS_LP_DEPLOY_ROLE_ARN` の設定（「前提」の 1・2）が済む前に `packages/lp/**` の変更が main に入ると、
  dev への自動デプロイが「Check deploy role is configured」で失敗する。設定後に Run workflow で再実行すればよい。
- CSP を変える（外部オリジンを足す等）ときは、infra 側 `live/services/lp` の tfvar `content_security_policy` を変更して apply する
  （アプリチーム所有の stack）。LP 側の制約は [AGENTS.md](../AGENTS.md) の「配信の制約」を参照。
