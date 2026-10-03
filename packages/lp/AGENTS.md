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
└── src/
    ├── assets/images/     # astro:assets の <Image> で最適化する元画像
    ├── components/        # セクション単位のコンポーネント（Hero / Pins / Steps / Walks / Together / Download 等）
    ├── layouts/BaseLayout.astro  # <head>（meta・OGP・robots）、アイコン定義、ヘッダー、フッター
    ├── pages/             # index.astro / privacy.astro / 404.astro / robots.txt.ts
    └── styles/global.css  # LP 全体のスタイル（デザイン原本の styles.css）
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
- `/.well-known/` は置いていない。

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
  - ダミー QR 画像は出さず、同じ大きさの「公開準備中」枠（`.qr-placeholder`）を置く。
  - ストアボタンは「準備中」ダイアログを開く（`StoreDialog.astro`）。ストア URL が確定したら、`Download.astro` のボタンをストアへのリンクに、
    `.qr-placeholder` を QR 画像に差し替える。
  - フッターにプライバシーポリシー（`/privacy/`）へのリンクを足し、コピーライトと右端に縦に並べた（`.footer-meta`、SS-158）。
- 画像は `src/assets/images/` に置き、`astro:assets` の `<Image>` で WebP に変換・`srcset` を付けて出す。`width` / `height` を必ず指定する（CLS 防止）。
  CSS が `.field-note > img` のように `<img>` を直接指すため、`<picture>` を出す `<Picture>` は使わない。
  ファーストビューの画像は `loading="eager"`（既定は lazy）。
- アイコンは `IconSprite.astro` の `<symbol>` を `<svg class="icon"><use href="#i-pin"></use></svg>` で参照する。

### 素材の出典

| ファイル                                                             | 出典                                                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/assets/images/app-icon.png`                                     | `packages/mobile/assets/app-icons/sanposcape-icon-1024.png` のコピー          |
| `src/assets/images/screens/*.png`                                    | アプリの画面イメージ（デザイン原本に同梱されていたもの）                      |
| `src/assets/images/walking-landscape.webp`                           | デザイン原本の作成時に画像生成（imagegen）で新規生成した風景イラスト          |
| `src/assets/images/route-map.svg`                                    | デザイン原本の作成時にこの LP 用に作った装飾用の模式地図                      |
| `public/favicon.png`（48px）・`public/apple-touch-icon.png`（180px） | アプリアイコンを sharp で縮小                                                 |
| `public/ogp.png`（1200x630）                                         | アプリアイコン・ワードマーク（DejaVu Sans Bold）・風景イラストを sharp で合成 |

「招待機能」セクションの図はコンセプトで、実際のアプリ画面ではない。

## デプロイ

GitHub Actions + OIDC で `dist/` を S3 に sync し、CloudFront を invalidation する（dev: main への push で自動、prod: 手動起動 + 承認）。
ワークフローは `.github/workflows/lp-deploy.yml`、手順・前提・確認項目は [デプロイ手順](./docs/deployment.md) を参照。

## プライバシーポリシー（`/privacy/`）

`src/pages/privacy.astro`。URL `https://sanposcape.com/privacy/` はアプリ内のリンク（`packages/mobile/src/config/legalLinks.ts`）と
App Store Connect の「プライバシーポリシー URL」に登録するため、**変えない**（変えると配布済みのアプリが古い URL を開き続ける）。

- 本文は実装の事実（取得する情報・送信先・保存期間・削除方法）に合わせて書いている。アプリや backend のデータの扱いを変えたら本文も見直し、
  ページ先頭の最終改定日（frontmatter の `revisedOn`）を更新する。制定日（`enactedOn`）は変えない。App Store Connect の App Privacy の申告（SS-159）と食い違わないようにする。
- 外部サービスの表は frontmatter の `externalServices` で持つ。540px 以下では 1 行を 1 枚のカードとして縦に並べる（見出しは `data-label` を CSS で出す）。
- 問い合わせ先のメールアドレスは frontmatter の `contactEmail`。
