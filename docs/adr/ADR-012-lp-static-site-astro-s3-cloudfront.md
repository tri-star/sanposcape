# ADR-012: LP は packages/lp の Astro 静的サイトとし、S3 + CloudFront へ GitHub Actions でデプロイする

## 現在有効な決定（要約）

> 最終更新: 2026-10-10（SS-159）。本節は本文（追補を含む）を要約したもので、一次記録は本文。
> 本文と食い違う場合は本節の誤りとして本節を直す。

### 決定

- **LP は `packages/lp` の Astro（`output: "static"`）で、`build.format: "directory"`・`trailingSlash: "always"`**。
  環境はビルド時の `LP_SITE_URL` / `PUBLIC_LP_ENV` で切り替え、production 以外は noindex。（本文: 決定1）
- **ページは `src/pages/<name>/index.astro` か `src/pages/<name>.astro` で追加する**（どちらも `<name>/index.html` に出力される）。
  （本文: 決定1、ポジティブな影響、SS-158 追補）
- **配信は非公開 S3 + OAC + CloudFront（stack `live/services/lp`）**。`www.` と `*.cloudfront.net` は正規ホストへ 301、
  存在しないパスは `/404.html` を 404 で返す。セキュリティヘッダーは Response headers policy で付け、WAF は付けない。（本文: 決定2）
- **CSP は `'unsafe-inline'` も外部オリジンも許さず、LP はインラインの script / style を出さない**。CI（`lp-ci.yml`）が `dist/` の HTML を検査する。
  外部オリジンを足すときは infra の tfvar `content_security_policy` とセットで変える。（本文: 決定3）
- **デプロイは `lp-deploy.yml`。dev は main への push で自動、prod は main からの手動起動 + Environment の承認で、成功時に `lp/vX.Y.Z` タグと Release を作る**。
  認証は Environment に紐づく OIDC、バケット名・distribution ID は SSM から実行時に読む。（本文: 決定4）
- **キャッシュは `_astro/**` が永久、それ以外は `max-age=0, s-maxage=86400`。デプロイのたびに `/*` を invalidation し、`_astro/` の旧ハッシュは消さない**。（本文: 決定5）
- **dev のインデックス抑止は noindex（meta と `X-Robots-Tag`）に任せ、robots.txt で Disallow にしない**。（本文: 決定6）
- **プライバシーポリシーは `src/pages/privacy.astro` → `https://sanposcape.com/privacy/` で公開し、LP のフッターからリンクする**。
  mobile は設定画面・サインイン / サインアップ画面からアプリ内ブラウザで開く（[ADR-M-020](../../packages/mobile/adr/ADR-M-020-external-web-pages.md)）。（本文: SS-158 追補）
- **`/privacy/` は恒久 URL で、変えない**（アプリ内リンクと App Store Connect に登録するため）。（本文: SS-158 追補）
- **お問い合わせは独立ページ・フォームにせず、`/privacy/#contact` の mailto（`support@sanposcape.com`）で代用する**。CSP は変えていない。
  （本文: コンテキスト、移行・対応事項、SS-158 追補）
- **ポリシーの運営者表記は屋号「Sanposcape 運営者」で、氏名・住所は利用者本人の請求に応じて回答する。保管先は AWS・Neon ともシンガポールと記載し、英語版は作らない**。
  アプリはストアの配信国を日本に限定し、ポリシーにも日本国内での利用が前提と書く（GDPR 等の対象にしないため）。13 歳未満は利用不可。（本文: SS-158 追補）
- **ポリシーは本文が実装の事実に依存するため、データの扱いを変えたら本文を見直して `revisedOn` を更新する**。App Privacy の申告（SS-159）と揃える。（本文: SS-158 追補）
- **ポリシーはアカウント削除時の写真について現状の実装どおり「画像ファイルは保存領域に残る（アプリからは見えない）」と書く**。
  SS-109（[ADR-009](./ADR-009-sanpo-map-pin-data-model-and-photo-upload.md) BK-2）などで削除の仕様を変えたら本文を直す。（本文: SS-158 追補）
- **App Store の App Privacy の申告は [`docs/app-privacy-label.md`](../app-privacy-label.md) を正本とし、ポリシーと同時に揃えて更新する**。
  組み込んだ SDK のプライバシーマニフェストの申告（Google Sign-In for iOS など）はそのまま取り込み、Expo の送信も保守的に申告する。
  ポリシーの利用目的に「改善・統計」があるため、集計に使うデータの種類には目的「分析」を付ける。（本文: SS-159 追補）
- **ポリシーの外部サービスの表には、SDK が端末から各社へ直接送る情報も書く**（Google でサインインの SDK・Expo のエラー情報）。（本文: SS-159 追補）

### 未解決・持ち越し

- **本番 LP は `/privacy/` を含まない版（`lp/v0.1.0`）のまま**。`/privacy/` を含む版を prod にデプロイしてから、アプリ内リンクを含む mobile のビルドを配布・審査に出す。
  App Store Connect への URL 登録と、`support@sanposcape.com` で受信できることの確認も公開前に要る（手作業）。（本文: SS-158 追補「リリース時に必要な手作業」）
- **サポートページ（`/support/`）は未作成で、App Store Connect の Support URL の扱いも未決**（Plane に該当課題なし）。（本文: SS-158 追補）
- **App Privacy は App Store Connect に未入力**（アプリレコードの作成時に手作業で入力する）。Expo が更新確認時の ID・エラーを保持するかは未確認で、
  保持しないと分かれば申告から外せる。Google Play のデータ セーフティは未整理。（本文: SS-159 追補）
- **利用規約は未作成**（Plane SS-187）。長期間使われていないアカウントの扱いも未決（Plane SS-188）。（本文: SS-158 追補）
- ストアの URL が決まったら、ストアボタンをリンクに、「公開準備中」の QR 枠を QR 画像に差し替える。（本文: 移行・対応事項）

### 変更・撤回された決定

- コンテキストの「お問い合わせページへの導線」→ 独立ページを作らず `/privacy/#contact` の mailto で代用（SS-158 追補）
- 「お問い合わせをフォームにする場合は CSP を更新する」→ mailto にしたため CSP の変更は不要（SS-158 追補）
- ページの追加は `src/pages/<name>/index.astro` → `src/pages/<name>.astro` も可（決定は不変、記述の補足。SS-158 追補）
- 本文のコンテキスト・ポジティブな影響にある「プライバシーポリシー・サポートページが増える」は初版時点の見込みで、SS-158 で作ったのはプライバシーポリシーのみ（SS-158 追補）
- ステータスの「dev / prod とも初回デプロイは未実施」は初版時点の状態で、2026-10-02 に両環境とも初回デプロイ済み（SS-158 追補）
- SS-158 追補の当初案「ポリシーに『アカウント削除で写真も削除する』と書き、SS-109 の完了前に本番で `pin_registration` を ON にしない」
  → 本文を現状の実装（写真の画像ファイルは残る）に合わせて書き直したため、ADR-012 としてのこのガードは不要になった。
  本番でフラグを ON にする前提条件（BK-2）は ADR-009 側に残る（SS-158 追補）

## 日付

2026-10-02（初版、SS-155 / infra 側 SS-74）、2026-10-03 追補（SS-158）、2026-10-10 追補（SS-159）

## ステータス

採用（SS-155 で決定）。配信面は sanposcape-infra の `live/services/lp`（SS-74、tri-star/sanposcape-infra#47）。
初版時点で dev / prod とも apply・初回デプロイは未実施で、手順は実運用で検証されていない
（**SS-158 追補**: 2026-10-02 に dev（main への push）と prod（main からの `workflow_dispatch` + 承認。`lp/v0.1.0`）の
初回デプロイが成功した。どちらも SS-158 の `/privacy/` を含まない版）。

**SS-158「プライバシーポリシー」で追補**した。プライバシーポリシーを `/privacy/` で公開し、お問い合わせは独立ページにせず
ポリシー内の mailto で代用した。詳細は末尾の「SS-158 追補: プライバシーポリシーを公開する」。本文中の追補部分には `（SS-158 追補）` を付けている。

**SS-159「App Privacy（プライバシー栄養ラベル）の申告内容の整理」で追補**した。申告内容を `docs/app-privacy-label.md` にまとめ、
SDK の収集に合わせてポリシーを改定した。詳細は末尾の「SS-159 追補: App Privacy の申告とポリシーを揃える」。

## コンテキスト

アプリの紹介サイト（LP）を `sanposcape.com`（dev は `dev.sanposcape.com`）で運営する必要が生じた。目的は次のとおり。

- アプリの紹介（どんなアプリか、どんな機能があるか）
- プライバシーポリシー・お問い合わせページへの導線（ストア申請・TestFlight 外部テスト、AWS SES のサンドボックス解除申請で URL が要る。SS-158）
  （**SS-158 追補**: お問い合わせは独立したページにせず、プライバシーポリシー内の窓口 `/privacy/#contact` の mailto で代用した）

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

| 対象                                                                  | Cache-Control                         |
| --------------------------------------------------------------------- | ------------------------------------- |
| `_astro/**`（ハッシュ付き）                                           | `public, max-age=31536000, immutable` |
| それ以外（HTML・`404.html`・`public/` の素材・`robots.txt`・sitemap） | `public, max-age=0, s-maxage=86400`   |

- 手順は「ハッシュ付きアセットを上げる → その他を上げる → `/*` を invalidation して完了を待つ → `_astro/` 以外を `--delete` で掃除」。
  エッジに古い HTML が残っている間に、そこから参照されるファイルを消さないため。
- `_astro/` の旧ハッシュのファイルは削除しない。デプロイ前から開いたままのタブ（古い HTML）は、遅延読み込みの画像などを
  後から旧ハッシュの名前で取りに来る。invalidation はブラウザが既に持っている HTML には効かないため、消すと 404 になる。
  - 増える量はビルド 1 回で最大 1.6MB 程度（画像を変えなければ CSS / JS の数十 KB）で、費用はほぼかからない。過去のコミットへのロールバックでも旧アセットがそのまま使える。
  - 見送り: S3 Lifecycle で「猶予期間の後に削除」。Lifecycle の期限はオブジェクトの作成日時から数えるため、
    使用中のアセットまで消える。避けるには、参照されなくなったファイルを同じキーへコピーし直してタグを付ける仕組みが要る。
    その場合、デプロイ用ロールに `GetObject` 等の権限を足すことになり、得られる効果（容量の削減）に見合わない。
    容量が問題になったら対応する（SS-166 で Todo として起票済み）。
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
  （**SS-158 追補**: `src/pages/<name>.astro` でもよい。`build.format: "directory"` によりどちらも `<name>/index.html` に出力される。
  SS-158 ではプライバシーポリシーを `src/pages/privacy.astro` として追加した。サポートページは作っていない）
- LP の変更は main へのマージで dev に出て、本番は承認付きで出せる。本番に出たコミットは `lp/v*` タグで追える。

### ネガティブな影響・トレードオフ

- CSP が厳しいため、インラインスクリプトを前提とする外部ツール（解析タグ・埋め込みフォーム等）は、そのままでは使えない。
- Astro の追加で、ワークスペースのロックファイルとルート `node_modules`（hoisted linker）に巻き上がる版が一部変わった。
  mobile の CI・Metro バンドル・`@expo/fingerprint` に影響が無いことは確認済み。
- dev の自動デプロイはロックファイルだけの変更（推移的依存の更新）では起動しない。必要なら手動で起動する。

### 移行・対応が必要な事項

- 初回: infra の dev apply → `development` に `AWS_LP_DEPLOY_ROLE_ARN` を設定 → dev で確認 → prod apply → `production` に設定 → main から承認付きでデプロイ
  （`packages/lp/docs/deployment.md`）。infra の apply より前に `packages/lp/**` の変更が main に入ると、dev の自動デプロイは失敗する（設定後に再実行で回復）。
  （**SS-158 追補**: 2026-10-02 に dev・prod とも初回デプロイが成功しており、この初回手順は完了している。ステータスの注記を参照）
- prod の apex に既存の A / AAAA レコードが無いかを、prod の apply 前に確認する（SS-155 時点で未確認）。
- ストアの URL が決まったら、ストアボタンをリンクに、「公開準備中」の QR 枠を QR 画像に差し替える。
- SS-158 のお問い合わせをフォームにする場合は、CSP の `form-action` / `connect-src` を infra の tfvar で更新する。
  （**SS-158 追補**: お問い合わせはフォームにせず mailto にしたため、CSP の変更は不要だった）

## SS-158 追補: プライバシーポリシーを公開する

コンテキストに挙げた「プライバシーポリシー・お問い合わせページへの導線」に答える。

### 決定

- **プライバシーポリシーは `src/pages/privacy.astro` として追加し、`https://sanposcape.com/privacy/`（dev は `https://dev.sanposcape.com/privacy/`）で公開する。**
  LP のフッターにリンクを置く（ヘッダーのナビはトップのセクションへのページ内リンクなので混ぜない）。
  mobile は設定画面とサインイン / サインアップ画面からアプリ内ブラウザで開く
  （[ADR-M-020](../../packages/mobile/adr/ADR-M-020-external-web-pages.md)。URL の定数は `packages/mobile/src/config/legalLinks.ts`）。
- **`/privacy/` は恒久 URL とし、変えない。** アプリ内のリンクと App Store Connect の「プライバシーポリシー URL」に登録するため。
  変えると配布済みのアプリが古い URL を開き続ける。末尾スラッシュ付き（決定1 の `trailingSlash: "always"`）・`www.` なし（決定2 で 301 される）を正とする。
- **お問い合わせは独立したページ・フォームにせず、ポリシー内の窓口 `/privacy/#contact` の mailto（`support@sanposcape.com`）で代用する。**
  フォームを置かないため、CSP（決定3）の `form-action` / `connect-src` の変更は不要だった。
- **サポートページ（`/support/`）は作らない（SS-158 の範囲では）。** App Store Connect の Support URL に何を登録するかは未決で、
  これを扱う Plane の課題も無い。
- **ポリシー本文の判断（ユーザー判断）**: 運営者は屋号「Sanposcape 運営者」と表記し、氏名・住所は「利用者本人から個人情報の取り扱いに関する請求があった場合に遅滞なく回答する」旨を添える
  （個人情報保護法 32 条 1 項の「本人の知り得る状態」は求めに応じた回答でも満たせるが、記述ごと消すとその手段を示せないため、回答の相手を利用者本人に限って残した）。
  窓口は `support@sanposcape.com`。データの保管先は AWS（ap-southeast-1）・Neon ともシンガポールと記載する。英語版は作らない（アプリ・LP とも日本語のみのため）。
  ストアの配信国は日本に限定し、本文にも日本国内での利用が前提と書く（GDPR・UK GDPR の対象にしないため）。13 歳未満は利用不可とする。
- **アカウント削除時の写真は、現状の実装どおりに書く（ユーザー判断）。** 当初は「アカウントを削除すると写真も削除する」と書き、
  SS-109（[ADR-009](./ADR-009-sanpo-map-pin-data-model-and-photo-upload.md) の BK-2）の完了まで本番で `pin_registration` を ON にしない運用で整合させる案だった。
  利用者目線・運営者目線のレビューで実装との食い違いを指摘され、「画像ファイルは保存領域に残る。表示に必要な情報は消えるためアプリからは見えない。
  消したい場合はアカウント削除の前にピン・写真を削除する」と書き直した（画像ファイルのキーは `user_id` を含むが、アカウント削除後は利用者と `user_id` を
  対応づける情報が残らないため、削除後の依頼で消すことは約束しない）。削除の仕様（論理削除と猶予期間後の物理削除などを検討中）を変えたら本文を直す。
- **ポリシー本文の書き方（ユーザー判断）**: 将来の機能追加のたびに改定が要らないよう、「〜しない」と断定せず「現在は〜していない。変える場合は事前に改定する」と書く。
  実装の細かい数値（記録間隔・丸めの桁）は書かず、丸めは目的（問い合わせ結果の再利用）を正直に書く。アクセスログの保存期間は「最長 400 日」と言い切る。
  利用目的・保存期間には、不正利用の調査や法令に基づく要請への対応、重要なお知らせ、改善・統計、サービス終了時の扱いを含める。
  開示等の請求の本人確認は、サインインに使っている Google アカウントのメールアドレスからの送信を原則とし、確認できなければ応じない。
- **ポリシー本文は実装の事実（取得する情報・送信先・保存期間・削除方法）に依存する。** アプリや backend のデータの扱いを変えたら本文を見直し、
  最終改定日（frontmatter の `revisedOn`）を更新する（`packages/lp/AGENTS.md`）。App Store Connect の App Privacy の申告（SS-159）と食い違わないようにする。
  （**SS-159 追補**: 申告の正本は `docs/app-privacy-label.md`。SS-159 で 2026-10-10 に初めて改定した）

### リリース時に必要な手作業

- 本番 LP を `/privacy/` を含む版でデプロイしてから（決定4 の prod は手動起動 + 承認）、アプリ内リンクを含む mobile のビルドを配布・審査に出す。
  2026-10-02 に prod へ出た `lp/v0.1.0` は `/privacy/` を含まないため、それまではアプリ内のリンク先が 404 になる（ADR-M-020 の「影響」）。
- App Store Connect の「プライバシーポリシー URL」に `https://sanposcape.com/privacy/` を登録する（手作業）。
  TestFlight の外部テストを始めるなら、開発用のアプリレコード（`com.sanposcape.app.dev`）にも同じ URL を登録する。
- 本番公開・ストア登録の前に、`support@sanposcape.com` で受信できることを確認する（受信設定は SS-158 の範囲外）。
- App Store Connect と Google Play Console で、配信国を日本のみに設定する（手作業）。

## SS-159 追補: App Privacy の申告とポリシーを揃える

App Store Connect の「App のプライバシー」に入力する内容を整理した。入力内容と根拠の一覧は [`docs/app-privacy-label.md`](../app-privacy-label.md)。

### 決定

- **申告の正本は `docs/app-privacy-label.md` に置く。** App Store Connect の回答は審査なしで変えられるため、正本が無いと
  ポリシー・実装とのずれに気づけない。ポリシー（`privacy.astro`）・`packages/lp/AGENTS.md`・`docs/release-runbook.md` §5.4 から参照する。
  データの扱い・SDK を変えたら、実装・ポリシー・申告の 3 つを同時に揃える。
- **組み込んだ SDK のプライバシーマニフェストの申告は、そのまま申告に取り込む。** Apple の定義では SDK の収集も申告対象。
  Google Sign-In for iOS（`GoogleSignIn` 9.x）はマニフェストで名前・メールアドレス・電話番号・おおよその位置情報・ユーザ ID・デバイス ID・
  その他の使用状況データ・その他のデータを（紐づく・トラッキングなしで）申告している。運営者が受け取らないもの（電話番号など）も含め、
  Xcode のプライバシーレポートとラベルを食い違わせないことを優先した。
  - 却下: 「Google でサインインは端末と Google の間のやり取りで、運営者が受け取る情報だけを申告すればよい」とする案。当初この案で書いたが、
    レビューで SDK のマニフェストと食い違うと指摘された。
- **Expo（expo-updates）の送信は、デバイス ID・クラッシュデータ（いずれも紐づかない）として保守的に申告する。**
  更新確認のリクエストに、インストールごとのランダムな ID（`EAS-Client-ID`）と、前回の起動時の致命的なエラーのメッセージ（`Expo-Fatal-Error`）が載る。
  Expo がこれらを保持するかを公開情報で確認できないため。保持しないと確認できたら外してよい。
- **運営者の収集には、集計に使うデータの種類（正確な位置情報・フィットネス・その他のユーザコンテンツ・診断データ）に目的「分析」を付ける。**
  ポリシーの「2. 利用目的」に「改善・新機能の開発」「統計情報の作成」があり、付けないと食い違うため。アクセス解析ツールを組み込んでいないこと（ポリシー 1-6）とは別の問い。
  名前・メールアドレス・写真は集計に使わないので付けない。
  - 却下: 「分析」を付けず、ポリシーの利用目的から改善・統計を外す案。ポリシーを狭めるより、現状の利用目的に申告を合わせる方が後の機能追加で改定が要らない。
- **散歩の時間・距離は「フィットネス」として申告する。** Motion & Fitness API は使っていないが、運動の記録にあたるため。
- **ポリシーを 2026-10-10 に改定した（初の改定）。** 外部サービスの表の Google でサインインの行に SDK が直接送る情報（端末の識別子・おおよその位置・利用状況など）を、
  Expo の行に前回の起動時のエラーを足し、1-6「取得しない情報」に SDK による直接送信の注記を足した。

### 影響

- ピンの検索 UI（`GET /pins` の `q` / `tags`）を付けたら「検索履歴」を、クラッシュ解析・アクセス解析などの SDK を足したら
  その SDK のマニフェストの申告を、それぞれ申告とポリシーに足す（`docs/app-privacy-label.md` §5）。
- App Store Connect への入力は手作業で残る。入力前に Xcode の「Generate Privacy Report」で、実際に入る SDK のマニフェストが申告表と一致するかを確かめる。
- 範囲外で見つかったもの（課題化は未実施）: `app.json` に `ios.privacyManifests` の設定が無い（Required Reason API の理由の宣言が要るかもしれない）。
  Google Play のデータ セーフティは未整理。写真の Exif 除去を検証するテストが無い。CloudFront のアクセスログ・`aws/spans` の保持期限は infra 側で未確認。

## 関連情報

- [ADR-004](./ADR-004-secrets-management-and-cicd-aws-credentials.md)（CI から AWS への認証は OIDC）
- [ADR-005](./ADR-005-backend-serverless-deployment-lambda-function-url.md)（backend のデプロイを手動起動にした理由）
- [ADR-006](./ADR-006-mobile-app-delivery-eas-hosted.md) 決定5（静的サイトの配信面は Terraform 側の S3 + CloudFront）
- [ADR-008](./ADR-008-deploy-release-separation.md) 決定4（アプリ別のタグと Release）
- [ADR-009](./ADR-009-sanpo-map-pin-data-model-and-photo-upload.md) の BK-2（アカウント削除時の写真削除。本番でピン機能を ON にする前提条件）（**SS-158 追補**）
- [ADR-M-020](../../packages/mobile/adr/ADR-M-020-external-web-pages.md)（アプリからプライバシーポリシーを開く方法と、URL をビルドで切り替えないこと）（**SS-158 追補**）
- `packages/lp/AGENTS.md`、`packages/lp/docs/deployment.md`、`.github/workflows/lp-ci.yml`、`.github/workflows/lp-deploy.yml`
- `packages/lp/src/pages/privacy.astro`、`packages/mobile/src/config/legalLinks.ts`（**SS-158 追補**）
- [`docs/app-privacy-label.md`](../app-privacy-label.md)（App Privacy の申告内容と根拠）（**SS-159 追補**）
- sanposcape-infra: ADR-0001 §2.11 / §2.15、`live/services/lp`（SS-74、tri-star/sanposcape-infra#47）
- Plane: SS-155（LP サイトの制作）、SS-74（infra: LP の配信面）、SS-158（プライバシーポリシー）、
  SS-109（アカウント削除時の写真削除 = ADR-009 BK-2）、SS-159（App Store Connect の App Privacy の申告）、
  SS-187（利用規約）、SS-188（長期間使われていないアカウントの扱い）
