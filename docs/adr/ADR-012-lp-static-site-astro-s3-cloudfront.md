# ADR-012: LP は packages/lp の Astro 静的サイトとし、S3 + CloudFront へ GitHub Actions でデプロイする

## 日付

2026-10-02（初版、SS-155 / infra 側 SS-74）

## ステータス

採用（SS-155 で決定）。配信面は sanposcape-infra の `live/services/lp`（SS-74、tri-star/sanposcape-infra#47）。
初版時点で dev / prod とも apply・初回デプロイは未実施で、手順は実運用で検証されていない。

## コンテキスト

アプリの紹介サイト（LP）を `sanposcape.com`（dev は `dev.sanposcape.com`）で運営する必要が生じた。目的は次のとおり。

- アプリの紹介（どんなアプリか、どんな機能があるか）
- プライバシーポリシー・お問い合わせページへの導線（ストア申請・TestFlight 外部テスト、AWS SES のサンドボックス解除申請で URL が要る。SS-158）

前提は次のとおり。

- [ADR-006](./ADR-006-mobile-app-delivery-eas-hosted.md) 決定5 で、AWS 側に要る mobile 隣接の配信面は
  「静的サイト」で SAM の対象外、Terraform（`sanposcape-infra`）の S3 + CloudFront で扱うと決まっている。
- ホスト名は sanposcape-infra の ADR-0001 §2.11 で LP = `sanposcape.com`（`www.` はリダイレクト）/ `dev.sanposcape.com` と割り当て済み。
  サービスごとに 1 stack・1 distribution（同 §2.15）。
- デザインは静的 HTML/CSS/JS として先に作成済み。LP は今後も継続的に更新し、ページ（プライバシーポリシー・サポート）も増える。
- リポジトリは public。CI から AWS への認証は OIDC のみ（[ADR-004](./ADR-004-secrets-management-and-cicd-aws-credentials.md) 決定5）。

## 決定

### 決定1: LP は `packages/lp` に Astro（`output: "static"`）で置く

- ソースはアプリ側リポジトリのワークスペースパッケージ `packages/lp`（パッケージ名 `lp`）。
- `build.format: "directory"`（`/privacy/` → `privacy/index.html`）、`trailingSlash: "always"`（正規 URL は末尾スラッシュ付き）。
- 画像は `astro:assets` で最適化し、CSS / JS / 画像は `_astro/` 配下にハッシュ付きで出す。
- ビルド時の環境変数で環境を切り替える: `LP_SITE_URL`（canonical・OGP・sitemap の絶対 URL）、
  `PUBLIC_LP_ENV`（`development` | `production`。production 以外は `<meta name="robots" content="noindex, nofollow">`）。

### 決定2: 配信は S3（非公開）+ OAC + CloudFront。stack は `live/services/lp`

infra 側（SS-74）と合意した構成。詳細の一次記録は sanposcape-infra の `live/services/lp/README.md`。

- `www.sanposcape.com` と `*.cloudfront.net` は、同じ distribution の CloudFront Function（viewer-request）が正規ホストへ 301 でリダイレクトする。
  同じ Function が `/` で終わる URI に `index.html` を付けて解決し、拡張子の無いパスは末尾 `/` 付きへ 301 する。
- 存在しないパスは `/404.html` を 404 ステータスで返す。
- セキュリティヘッダーは Response headers policy で付ける（HSTS・nosniff・`X-Frame-Options: DENY`・Referrer-Policy・Permissions-Policy・CSP）。
  dev だけ `X-Robots-Tag: noindex, nofollow` を付ける。WAF は付けない（静的・S3 オリジンのみで、固定費に見合わない）。

### 決定3: CSP は `'unsafe-inline'` も外部オリジンも許さない。LP はそれに合わせて出力する

CSP は CloudFront がヘッダーで付け、値は infra 側の tfvar `content_security_policy` で持つ（アプリチーム所有の stack なので、変更はアプリ側で apply できる）。

```
default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

- LP は `build.inlineStylesheets: "never"` と `vite.build.assetsInlineLimit: 0` で、インラインの `<script>` / `<style>` を出さない。
  `style` 属性・`is:inline`・`set:html`・`define:vars`・JSON-LD のインライン script も使わない。
- CI（`lp-ci.yml`）が `dist/` 配下の全 HTML を grep し、インラインのスクリプト本文・`<style>`・`style` 属性・`on*` 属性があれば失敗させる。
- 外部オリジン（Web フォント・CDN・解析）は使わない。足す場合は CSP の tfvar とセットで変更する。

### 決定4: デプロイは GitHub Actions（`lp-deploy.yml`）。dev は main への push で自動、prod は手動起動 + 承認

- dev: `packages/lp/**`（とワークフロー自体）を含む main への push で自動。`workflow_dispatch` なら任意の ref からも可。
- prod: `workflow_dispatch` のみ・main からのみ・Environment `production` の承認。成功時に `lp/vX.Y.Z` タグと GitHub Release を作る
  （規則は backend と同じ。[ADR-008](./ADR-008-deploy-release-separation.md) 決定4、`cliff.toml` を共有）。
- 認証は OIDC。ロールは `sanposcape-<env>-lp-deploy`（`live/services/lp` に置き、バケット・distribution・SSM の LP 用パスに絞る）。
  trust は `environment:development|production` の subject だけ。ロール ARN は GitHub Environment Variables `AWS_LP_DEPLOY_ROLE_ARN`。
  Environment は backend と共用する（同じ Environment の job からは sam-deploy・feature-flags・lp-deploy のどのロールも assume できることを許容する）。
- バケット名・distribution ID は SSM `/sanposcape/<env>/services/lp/{bucket_name,distribution_id,site_url}` から実行時に読み、
  取得直後に `add-mask` する。リポジトリにも GitHub にも置かない。
- build job（依存のコードを実行する）には `id-token: write` も environment も付けない。
  `pull_request` / `pull_request_target` トリガーは付けない。

### 決定5: キャッシュは「ハッシュ付きは永久、それ以外は毎回再検証」。デプロイのたびに `/*` を invalidation する

| 対象 | Cache-Control |
| --- | --- |
| `_astro/**`（ハッシュ付き） | `public, max-age=31536000, immutable` |
| それ以外（HTML・`404.html`・`public/` の素材・`robots.txt`・sitemap） | `public, max-age=0, s-maxage=86400` |

- 手順は「ハッシュ付きアセットを上げる → その他を上げる → `/*` を invalidation して完了を待つ → `--delete` で掃除」。
  古い HTML を持つ閲覧者が旧アセットを取りに来ても 404 にしないため。
- `s-maxage=86400` は、invalidation に失敗しても HTML が最大 1 日で入れ替わる保険。
- `public/` のファイルはハッシュが付かないので、内容を差し替えるときはファイル名を変える。

### 決定6: dev のインデックス抑止は noindex に任せ、robots.txt で Disallow にしない

dev は meta robots と CloudFront の `X-Robots-Tag` で noindex にする。robots.txt は production だけ Sitemap を載せ、どの環境でも `Disallow` にしない。
Disallow するとクローラーがページを取得できず noindex を読めないため、外部からリンクされた URL が「内容なし」でインデックスされうる。

## 検討した選択肢

### ビルド方式

#### 選択肢1: Astro（静的出力） ← 採用

- **概要**: Astro のページ・レイアウト・コンポーネントで組み、静的 HTML を出力する。
- **メリット**: ヘッダー・フッター・`<head>` をレイアウトで共通化でき、ページ追加が容易。画像最適化とハッシュ付きアセットが標準で付く。既定でクライアント JS がゼロ。
- **デメリット**: ビルドの依存が増える（ワークスペースのロックファイルにも影響する）。

#### 選択肢2: 素の HTML / CSS / JS（ビルドなし）

- **概要**: デザインをそのまま置き、S3 へ上げる。
- **メリット**: 依存もビルドも無く最小。
- **デメリット**: ページが増えるとヘッダー・フッターが重複する。アセットにハッシュが付かず、長期キャッシュを使えない。

#### 選択肢3: Vite（マルチページ）

- **概要**: Vite で複数 HTML をビルドする。
- **メリット**: アセットのハッシュ化・最適化はできる。
- **デメリット**: 共通レイアウトのテンプレート機能が無く、HTML の重複は残る。

### デプロイ方法

#### 選択肢A: dev は main への push で自動、prod は手動起動 + 承認 ← 採用

- **メリット**: 更新頻度の高い LP で dev への反映に手間がかからず、本番公開は承認で止められる。
- **デメリット**: ブランチを dev で確認している最中に main への push があると、dev が main の内容に戻る。

#### 選択肢B: 両環境とも手動起動（backend-deploy.yml と同じ）

- **メリット**: backend と運用が揃う。dev をブランチの検証に占有できる。
- **デメリット**: dev への反映も毎回手動になる。backend が手動にしている主な理由（スキーマ変更とデプロイの不可分、
  [ADR-005](./ADR-005-backend-serverless-deployment-lambda-function-url.md)）は、静的サイトの LP には当てはまらない。

#### 選択肢C: ローカルから CLI でデプロイ

- **メリット**: CI が要らない最小構成。
- **デメリット**: 誰がいつ何を出したかが残らず、ビルド環境も揃わない。手元に AWS 権限を配る必要がある。

## 決定理由

- LP は今後ページが増え、継続的に更新されるため、レイアウトの共通化と長期キャッシュ可能なアセットを最初から持てる Astro を選んだ（ユーザー判断）。
- デプロイは、DB やスキーマを持たない静的サイトで dev への自動反映のリスクが小さく、本番だけ承認で止めれば足りるため選択肢A を選んだ（ユーザー判断）。
- 配信面・CSP・キャッシュは、既存の backend-api と同じ「stack をサービスごとに分け、契約値は SSM、認証は Environment に紐づく OIDC」の型に合わせ、
  infra 側と合意した（SS-74）。

## 影響

### ポジティブな影響

- プライバシーポリシー・サポートページ（SS-158）を `src/pages/<name>/index.astro` として追加するだけで公開できる。
- LP の変更は main へのマージで dev に出て、本番は承認付きで出せる。本番に出たコミットは `lp/v*` タグで追える。

### ネガティブな影響・トレードオフ

- CSP が厳しいため、インラインスクリプトを前提とする外部ツール（解析タグ・埋め込みフォーム等）は、そのままでは使えない。
- Astro の追加で、ワークスペースのロックファイルとルート `node_modules`（hoisted linker）に巻き上がる版が一部変わった。
  mobile の CI・Metro バンドル・`@expo/fingerprint` に影響が無いことは確認済み。
- dev の自動デプロイはロックファイルだけの変更（推移的依存の更新）では起動しない。必要なら手動で起動する。

### 移行・対応が必要な事項

- 初回: infra の dev apply → `development` に `AWS_LP_DEPLOY_ROLE_ARN` を設定 → dev で確認 → prod apply → `production` に設定 → main から承認付きでデプロイ
  （`packages/lp/docs/deployment.md`）。infra の apply より前に `packages/lp/**` の変更が main に入ると、dev の自動デプロイは失敗する（設定後に再実行で回復）。
- prod の apex に既存の A / AAAA レコードが無いかを、prod の apply 前に確認する（SS-155 時点で未確認）。
- ストアの URL が決まったら、ストアボタンをリンクに、「公開準備中」の QR 枠を QR 画像に差し替える。
- SS-158 のお問い合わせをフォームにする場合は、CSP の `form-action` / `connect-src` を infra の tfvar で更新する。

## 関連情報

- [ADR-004](./ADR-004-secrets-management-and-cicd-aws-credentials.md)（CI から AWS への認証は OIDC）
- [ADR-005](./ADR-005-backend-serverless-deployment-lambda-function-url.md)（backend のデプロイを手動起動にした理由）
- [ADR-006](./ADR-006-mobile-app-delivery-eas-hosted.md) 決定5（静的サイトの配信面は Terraform 側の S3 + CloudFront）
- [ADR-008](./ADR-008-deploy-release-separation.md) 決定4（アプリ別のタグと Release）
- `packages/lp/AGENTS.md`、`packages/lp/docs/deployment.md`、`.github/workflows/lp-ci.yml`、`.github/workflows/lp-deploy.yml`
- sanposcape-infra: ADR-0001 §2.11 / §2.15、`live/services/lp`（SS-74、tri-star/sanposcape-infra#47）
- Plane: SS-155（LP サイトの制作）、SS-74（infra: LP の配信面）、SS-158（プライバシーポリシー）
