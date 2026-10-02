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
  → ci（lp-ci.yml: astro check / Prettier / build / インライン混入の検査）
  → build（LP_SITE_URL・PUBLIC_LP_ENV を渡して astro build。id-token なし）
  → deploy（environment 付き。OIDC で AssumeRole → S3 へアップロード → invalidation → 掃除 → 疎通確認）
  → release（production のみ。lp/vX.Y.Z タグと GitHub Release）
```

### deploy job の中身

1. SSM（ap-southeast-1）から契約値を読み、ログに出ないよう `add-mask` する。
   - `/sanposcape/<env>/services/lp/bucket_name`
   - `/sanposcape/<env>/services/lp/distribution_id`
2. `_astro/`（ハッシュ付き）を `Cache-Control: public, max-age=31536000, immutable` でアップロードする（削除はしない）。
3. それ以外（HTML・`404.html`・`public/` の素材・`robots.txt`・sitemap）を `Cache-Control: public, max-age=0, s-maxage=86400` でアップロードする。
4. `/*` を invalidation し、完了を待つ。
5. 2・3 と同じ分け方で `--delete` を付けて同期し、古いファイルを消す。
6. 公開 URL が 200 を返すことを確認する。

「上げる → キャッシュ削除 → 掃除」の順にしているのは、古い HTML を持っている閲覧者が旧アセットを取りに来ても 404 にしないため。
消しすぎた場合は、バケットのバージョニング（旧バージョンは 30 日保持）から戻せる。

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

## 確認項目

```bash
SITE=https://dev.sanposcape.com
curl -sI "$SITE/"                       # 200。セキュリティヘッダー（CSP 等）と dev のみ X-Robots-Tag: noindex
curl -sI "$SITE/no-such-page/"          # 404（中身は 404.html）
curl -sI "$SITE/index.html"             # Cache-Control: public, max-age=0, s-maxage=86400
curl -sI "$SITE/_astro/<任意のファイル>"  # Cache-Control: public, max-age=31536000, immutable
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
  release job は、最新の `lp/v*` タグが祖先でない SHA のデプロイではタグを作らない。

## 注意

- **pull_request / pull_request_target トリガーを足さない。** public リポジトリのため、fork の PR からデプロイ経路
  （Environment と OIDC）に到達され得る。ロールの trust も `environment:<名前>` の subject しか許していない。
- **Environment は backend と共用している。** `environment: development` を付けた job は、どのワークフローからでも
  sam-deploy・feature-flags・lp-deploy のロールを AssumeRole できる。分けたくなったら LP 専用の Environment を作り、
  infra 側の tfvar で trust の Environment 名を変える。
- dev をブランチで確認している最中に `packages/lp/**` を含む main への push があると、dev は main の内容に戻る。
- CSP を変える（外部オリジンを足す等）ときは、infra 側 `live/services/lp` の tfvar `content_security_policy` を変更して apply する
  （アプリチーム所有の stack）。LP 側の制約は [AGENTS.md](../AGENTS.md) の「配信の制約」を参照。
