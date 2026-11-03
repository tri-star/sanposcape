# LP（packages/lp）に関する開発ドキュメント

Sanposcape の紹介サイト（`sanposcape.com` / `dev.sanposcape.com`）。Astro の静的出力（`output: "static"`）で
HTML・CSS・JS・画像を `dist/` に書き出し、S3 + CloudFront で配信する（SS-155）。

構成・配信・デプロイ方式を決めた経緯は [ADR-012](../../docs/adr/ADR-012-lp-static-site-astro-s3-cloudfront.md) を参照
（変える場合は ADR の追補が要る）。

## コマンド

リポジトリルートで実行する（依存はルートの `pnpm install` でワークスペース一括で入る）。

| コマンド                                   | 内容                                                       |
| ------------------------------------------ | ---------------------------------------------------------- |
| `pnpm --filter lp dev`                     | 開発サーバー（http://localhost:4321）                      |
| `pnpm --filter lp build`                   | `dist/` に静的サイトを出力                                 |
| `pnpm --filter lp preview`                 | `dist/` をローカル配信して確認                             |
| `pnpm --filter lp check`                   | `astro check`（`.astro` / TS の型検査）                    |
| `pnpm --filter lp format` / `format:check` | Prettier（`prettier-plugin-astro`）で整形 / 整形済みか検査 |

CI（`.github/workflows/lp-ci.yml`）は `check` → `format:check` → `build` → インライン混入の検査を回す（`lp-deploy.yml` からも呼ばれる）。

## 構成

```
packages/lp/
├── astro.config.mjs       # site / trailingSlash / env スキーマ / CSP 向けのビルド設定
├── public/                # そのままの名前で配信するファイル（favicon・apple-touch-icon・OGP 画像）
├── scripts/write-well-known.mjs  # ビルド後に dist/.well-known/ を書く（SS-250）
└── src/
    ├── assets/images/     # astro:assets の <Image> で最適化する元画像
    ├── components/        # セクション単位のコンポーネント（Hero / Pins / Steps / Walks / Together / Download 等）
    ├── layouts/BaseLayout.astro  # <head>（meta・OGP・robots）、アイコン定義、ヘッダー、フッター
    ├── pages/             # index.astro / privacy.astro / terms.astro / support.astro / i/index.astro（招待リンク）/ 404.astro / robots.txt.ts
    │                      # privacy/<YYYY-MM-DD>.astro は改定前のポリシーの版（不利な改定のときに固定する）
    └── styles/            # global.css（LP 全体。デザイン原本の styles.css）/ legal.css（privacy・terms・support 共通）
```

ページを増やすとき（プライバシーポリシー・サポート等）は `src/pages/<name>/index.astro` か `src/pages/<name>.astro` を作り、
`BaseLayout` で包む（トップ以外では `isHome` を付けない。ヘッダーのページ内リンクが `/#pins` のようにトップへ向く）。

## 規約

### 配信の制約（インフラ側 sanposcape-infra SS-74 との合意）

- **CSP**: CloudFront がレスポンスヘッダーで次の CSP を付ける。
  `default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  - そのため、出力 HTML にインラインの `<script>`（JSON-LD も含む）・`<style>`・`style="..."` 属性を残さない。
    `astro.config.mjs` の `build.inlineStylesheets: "never"` と `vite.build.assetsInlineLimit: 0` はこのための設定なので外さない。
  - コンポーネントの `<script>` / `<style>` は Astro が `_astro/` 配下の外部ファイルに出すので使ってよい。
    ただし `is:inline`・`set:html` でのインライン化や、`style` 属性・`define:vars`（`style` 属性を生成する）は使わない。
  - 外部オリジン（Web フォント・CDN・アクセス解析など）は読み込まない。
  - CI（`lp-ci.yml`）がビルド後の `dist/` 配下のすべての HTML（サブディレクトリを含む）を grep し、インラインのスクリプト本文・`<style>`・`style` 属性・`on*` イベントハンドラ属性があれば失敗させる。
- **URL**: 正規 URL は末尾スラッシュ付き（`trailingSlash: "always"`）。サイト内リンク・canonical・sitemap も `/privacy/` のように書く。
  出力は `build.format: "directory"`（`/privacy/` → `privacy/index.html`）。
- **キャッシュ**: `_astro/**`（ハッシュ付き）は immutable の長期キャッシュ、それ以外は `max-age=0, s-maxage=86400` で配信される。
  `public/` のファイルはハッシュが付かないため、**内容を差し替えるときはファイル名を変える**（例: `ogp.png` → `ogp-2.png`）。
  デプロイは `_astro/` の旧ハッシュのファイルを削除しない（開いたままのタブが古い HTML から取りに来るため。ADR-012 決定5）。
- **`/.well-known/`**（地図の招待リンクの Universal Links / App Links。SS-250）: `public/` には置かず、`pnpm --filter lp build` の後に
  `scripts/write-well-known.mjs` が `PUBLIC_LP_ENV` に応じて `dist/.well-known/` に書く（本番と開発用でアプリ識別子が違うため）。
  - `apple-app-site-association`（拡張子なし）は、`lp-deploy.yml` が sync から外し `aws s3 cp --content-type application/json` で上げる
    （sync では `binary/octet-stream` になり、CloudFront の `nosniff` で iOS が読めない）。sync の `--exclude` は 3 回とも揃える。
  - 対象の path は `/i/`（招待リンクの受け皿）だけ。LP の他のページは Universal Link にしない。
  - `assetlinks.json` は署名証明書の SHA-256 がある環境だけ出す（開発用は EAS の開発用 keystore。本番は Android のストアの準備ができてから足す）。
  - Team ID・SHA-256 は公開する前提の識別子で、秘密ではない。アプリの識別子を変えたら、このスクリプトも直す。

### 環境変数（ビルド時）

| 変数            | 既定値                   | 用途                                                                                                                                                                                                           |
| --------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LP_SITE_URL`   | `https://sanposcape.com` | canonical・OGP・sitemap・robots.txt の絶対 URL。dev 環境向けビルドでは `https://dev.sanposcape.com` を渡す                                                                                                     |
| `PUBLIC_LP_ENV` | `development`            | `development` \| `production`（`astro:env` のスキーマで検証され、それ以外はビルドエラー）。`production` 以外では `<meta name="robots" content="noindex, nofollow">` を出し、`robots.txt` に Sitemap を載せない |

dev 環境は CloudFront も `X-Robots-Tag: noindex` を付け、meta robots と合わせて二重に noindex にする。
`robots.txt` で `Disallow` にはしない（クローラーがページを取得できず noindex を読めなくなり、外部からリンクされた URL が
「内容なし」でインデックスされうるため）。
404 ページは環境に関係なく noindex で、canonical を出さない。sitemap（`@astrojs/sitemap`）からも除外している。

### デザインと画像

- 見た目の正解は、デザイン原本（Codex で作成した静的 HTML/CSS/JS。リポジトリ外の作業フォルダにあった）を移した現在の実装。
  `src/styles/global.css` は原本の `styles.css` を値を変えずに移したもの（Prettier の整形と、下記「原本から意図的に変えた点」を除く）。
  見た目を変えるときはデザインの更新として扱い、PC（1440px）とスマホ（390px）の全体スクリーンショットで崩れがないか確認する。
- 本番公開に向けて原本から意図的に変えた点:
  - 「※このページはデザインプレビューです…」の注記を削除。ダイアログの文言も「公開まで、もうしばらくお待ちください。」に変更。
  - ダミー QR 画像は出さず、ストア URL が未確定のストアには同じ大きさの「公開準備中」枠（`.qr-placeholder`）を置く。
  - ストア URL が未確定のストアのボタンは「準備中」ダイアログを開く（`StoreDialog.astro`）。
    `Download.astro` の `stores` で、URL が確定したストア（`url` と `qr` を持つ。現在は iPhone の App Store、SS-247）はボタンをストアへのリンク、QR の位置を QR 画像にしている。
    Android（Google Play）は URL が確定したら `url` と `qr` を足す（足し終えたら `StoreDialog.astro` と `.store-preview`・`.qr-placeholder` は不要になる）。
  - フッターに利用規約（`/terms/`、SS-187）・プライバシーポリシー（`/privacy/`）・サポート（`/support/`、SS-214）へのリンクを足し、コピーライトと右端に縦に並べた（`.footer-meta`、SS-158）。
- 画像は `src/assets/images/` に置き、`astro:assets` の `<Image>` で WebP に変換・`srcset` を付けて出す。`width` / `height` を必ず指定する（CLS 防止）。
  CSS が `.field-note > img` のように `<img>` を直接指すため、`<picture>` を出す `<Picture>` は使わない。
  ファーストビューの画像は `loading="eager"`（既定は lazy）。
- アイコンは `IconSprite.astro` の `<symbol>` を `<svg class="icon"><use href="#i-pin"></use></svg>` で参照する。

### 素材の出典

| ファイル                                                             | 出典                                                                                                |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/assets/images/app-icon.png`                                     | `packages/mobile/assets/app-icons/sanposcape-icon-1024.png` のコピー                                |
| `src/assets/images/screens/*.png`                                    | アプリの画面イメージ（デザイン原本に同梱されていたもの）                                            |
| `src/assets/images/qr-app-store-ios.svg`                             | App Store の公開 URL（`Download.astro` の `url`）から segno（Python）で生成。URL を変えたら作り直す |
| `src/assets/images/walking-landscape.webp`                           | デザイン原本の作成時に画像生成（imagegen）で新規生成した風景イラスト                                |
| `src/assets/images/route-map.svg`                                    | デザイン原本の作成時にこの LP 用に作った装飾用の模式地図                                            |
| `public/favicon.png`（48px）・`public/apple-touch-icon.png`（180px） | アプリアイコンを sharp で縮小                                                                       |
| `public/ogp.png`（1200x630）                                         | アプリアイコン・ワードマーク（DejaVu Sans Bold）・風景イラストを sharp で合成                       |

「招待機能」セクションの図はコンセプトで、実際のアプリ画面ではない。

## デプロイ

GitHub Actions + OIDC で `dist/` を S3 に sync し、CloudFront を invalidation する（dev: main への push で自動、prod: 手動起動 + 承認）。
ワークフローは `.github/workflows/lp-deploy.yml`、手順・前提・確認項目は [デプロイ手順](./docs/deployment.md) を参照。

## プライバシーポリシー（`/privacy/`）

`src/pages/privacy.astro`。URL `https://sanposcape.com/privacy/` はアプリ内のリンク（`packages/mobile/src/config/legalLinks.ts`）と
App Store Connect の「プライバシーポリシー URL」に登録するため、**変えない**（変えると配布済みのアプリが古い URL を開き続ける）。

- 本文は実装の事実（取得する情報・送信先・保存期間・削除方法）に合わせて書いている。事実の正本は
  [データ取扱い台帳](../../docs/privacy/data-inventory.md)で、本文と App Store Connect の App Privacy の申告（[docs/app-privacy-label.md](../../docs/app-privacy-label.md)）はこの台帳から書く。
  アプリや backend のデータの扱いを変えたら、台帳 → 本文 → 申告の順に見直し、ページ先頭の最終改定日（frontmatter の `revisedOn`）を更新する。制定日（`enactedOn`）は変えない。
  どの変更が対象になるか（対象パス）と手順は台帳に書いてある。
- 本文は、main の挙動だけでなく**サポート中のすべてのアプリの挙動の和集合**で書く（配布済み・審査中のバイナリが古い挙動のまま残るため。SS-231）。
  古いアプリにだけ残る挙動の記述は、最低サポートバージョンを上げてから1日経つまで消さない。規則と、消してよい条件の一覧は台帳の 2.1・6。これにより本番の LP はいつでも main からデプロイできる。
- 外部サービスの表は frontmatter の `externalServices` で持つ。540px 以下では 1 行を 1 枚のカードとして縦に並べる（見出しは `data-label` を CSS で出す）。
- 問い合わせ先のメールアドレスは frontmatter の `contactEmail`。

### 改定の手順（プライバシーポリシー・利用規約）

規則（不利な改定の判断・施行日の目安）は台帳の 2.2。ここではページでの実装だけを書く（SS-231）。

- **不利でない改定**（記述を正確にする、和集合への書き足しのうち不利でないもの、利用者に有利な変更）: 本文を直し、`revisedOn` を更新する。掲載した時点から効力を生じる（ポリシー 12・規約 11）。
- **利用者に不利な改定**: 施行日を付けて事前に公開し、改定前の版を残す。施行日に再デプロイしなくて済むよう、新しい本文を先に `/privacy/`（`/terms/`）に載せる。
  1. 改定前の版を `src/pages/privacy/<改定前の版の revisedOn（なければ enactedOn）を YYYY-MM-DD>.astro`（規約は `src/pages/terms/...`）に複製し、固定する。
     `/privacy/2026-10-24/` のような URL になる。旧版は `BaseLayout` の `noindex` を付け、冒頭に「この版は <施行日の前日> まで適用されます。<施行日> から適用する版は /privacy/」と書く（手順 2 と同じく、施行日の前後どちらでも正しい文にする）。以後は書き換えない。
  2. `/privacy/` の本文を新しい内容にし、`revisedOn` を公開する日に、新しく持たせる施行日（`effectiveOn`）を施行日にする。ヘッダーに「施行日」を出し、
     冒頭に「<施行日> から適用します。<施行日の前日> までは改定前の版（リンク）が適用されます」と書く（施行日の前後どちらでも正しい文にして、施行日に書き換えずに済むようにする）。
  3. 末尾に「改定履歴」の節を設け、改定日・施行日・要点と旧版へのリンクを載せる（最初の不利な改定のときに作る。それより前の改定は git の履歴にある）。
  4. sitemap から旧版を外す（`astro.config.mjs` の sitemap の `filter`）。
- 実装（最初の不利な改定 SS-248 で作った。利用規約にはまだ無く、最初の不利な改定のときに同じ形で作る）:
  - `privacy.astro` の frontmatter の `effectiveOn`（施行日）・`previousVersion`（旧版の URL と適用の終わる日）・`revisionHistory`（改定履歴の行）。
    `effectiveOn` があるとき、ヘッダーに施行日を出し、冒頭に適用の案内（`.legal-notice`）を出す。施行日を過ぎた後に不利でない改定をするときは `effectiveOn` を `undefined` に戻す（案内が消え、経緯は改定履歴に残る）。
  - 旧版 `src/pages/privacy/<YYYY-MM-DD>.astro` は frontmatter の `appliesUntil`・`nextEffectiveOn` で冒頭の案内を出す。本文は以後書き換えない（この2つの日付だけは、本番へのデプロイが遅れて新しい版の施行日を動かすときに合わせる）。
  - sitemap からは `astro.config.mjs` の `filter` が `/privacy/<YYYY-MM-DD>/`・`/terms/<YYYY-MM-DD>/` の形をまとめて外す（版を足すたびに直さなくてよい）。
  - 次の不利な改定では、その時点の `/privacy/` を手順 1 で新しい日付のファイルに複製し、`revisionHistory` の先頭に行を足す。
- サポートページ（`/support/`）はポリシーの節へリンクしているだけなので、施行日・旧版の仕組みは要らない。

## 招待リンクの受け皿（`/i/`）

`src/pages/i/index.astro`（SS-250）。招待リンク `https://sanposcape.com/i/#<token>`（dev は `dev.sanposcape.com`）は、アプリが入っていれば
Universal Links / App Links でアプリが開くので、このページが出るのはアプリが無いとき・リンクの検証が効かないとき。

- トークンは fragment にあり、サーバー（CloudFront・S3）には届かない。ページはトークンを検証せず、招待の中身（地図の名前など）を出さない。
- 「アプリで開く」の href は外部の JS（Astro が `_astro/` に出す `<script>`）が fragment から `sanposcape://invite?t=<token>`
  （開発用は `sanposcape-dev://`）に組み立てる。base64url 以外の値は載せない。
- noindex で、sitemap からも外す。URL（`/i/`）は `.well-known` とアプリの intentFilters の対象なので変えない。

## 利用規約（`/terms/`）

`src/pages/terms.astro`。URL `https://sanposcape.com/terms/` もアプリ内のリンク（`legalLinks.ts` の `TERMS_URL`）に使うため**変えない**（SS-187）。

- スタイルはプライバシーポリシーと共通の `src/styles/legal.css`（各ページのフロントマターで import）。
- 制定日 `enactedOn` は変えず、改定したら `revisedOn` を更新する。年齢の制限（13 歳未満は不可）と、削除後も不正利用の調査・再登録の防止のために情報を保存することは、
  プライバシーポリシー（11・6）と同じ内容にしておく。どちらかを変えたら両方を見直す。
- 損害賠償の上限額（10）と専属的合意管轄裁判所（13）は運営者が決める値。変えるときは運営者の確認を取る。

## サポート（`/support/`）

`src/pages/support.astro`（SS-214）。URL `https://sanposcape.com/support/` は App Store Connect の「サポート URL」に登録するため**変えない**。
よくある質問・動作環境・お問い合わせ（mailto）を載せる。決めた経緯は ADR-012 の SS-214 追補。

- 利用者のデータの扱い（取得・保存期間・削除の対象）の事実は書き写さず、プライバシーポリシーの節（`/privacy/#delete` など）へリンクする。
  ポリシーの節の番号・アンカーを変えたら、このページのリンクも直す。
- 画面名・ボタン名（「アカウント」タブ →「設定」→「アカウントを削除」など）はアプリの表記に合わせている。アプリの表記を変えたら見直す。
- 動作環境（iOS 16.4 以降・Android 7.0 以降）は Expo SDK のテンプレートの iOS のデプロイターゲットと React Native の `minSdk` から書いた値。Expo SDK を上げたら見直す。
