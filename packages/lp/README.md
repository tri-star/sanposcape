# lp

Sanposcape の紹介サイト（LP）。Astro の静的サイトとしてビルドし、S3 + CloudFront で配信する。

## ローカルで起動する

リポジトリルートで実行する。

```bash
pnpm install
pnpm --filter lp dev        # http://localhost:4321
```

本番と同じ静的出力を確認する場合:

```bash
pnpm --filter lp build
pnpm --filter lp preview    # http://localhost:4321
```

本番向け（検索エンジンにインデックスさせる）ビルドは `PUBLIC_LP_ENV=production` を付ける。
dev 環境向けは `LP_SITE_URL=https://dev.sanposcape.com` を付ける。

## 検査

```bash
pnpm --filter lp check          # 型検査（astro check）
pnpm --filter lp format:check   # 整形（Prettier）
```

構成・規約（CSP の制約、URL、画像の扱い、デザイン原本からの変更点など）は [AGENTS.md](./AGENTS.md) を参照。
