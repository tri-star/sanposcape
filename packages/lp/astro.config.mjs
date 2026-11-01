// @ts-check
import sitemap from "@astrojs/sitemap";
import { defineConfig, envField } from "astro/config";

// 配信先の URL。canonical・OGP・sitemap・robots.txt の絶対 URL に使う。
// dev 環境（dev.sanposcape.com）へデプロイするビルドでは CI から上書きする。
const site = process.env.LP_SITE_URL ?? "https://sanposcape.com";

export default defineConfig({
  site,
  output: "static",
  // 正規 URL は末尾スラッシュ付き（インフラ側の CloudFront の設定と合わせる）。
  // サイト内リンク・canonical・sitemap もこれに揃える。
  trailingSlash: "always",
  build: {
    // /privacy/ → /privacy/index.html のように出力し、S3 + CloudFront でも
    // ディレクトリ形式の URL をそのまま配信できるようにする。
    format: "directory",
    // CloudFront が CSP（style-src 'self' / script-src 'self'。'unsafe-inline' なし）を
    // ヘッダーで付けるため、CSS を <style> としてインライン化させない。
    inlineStylesheets: "never",
  },
  vite: {
    build: {
      // 同じく CSP のため。小さなスクリプトやアセットもインライン化（<script> 本文や
      // data: URI）せず、_astro/ 配下のハッシュ付きファイルとして出力させる。
      assetsInlineLimit: 0,
    },
  },
  env: {
    schema: {
      // 環境区分。production 以外のビルドは検索エンジンにインデックスさせない
      // （<meta name="robots"> と robots.txt で制御）。
      PUBLIC_LP_ENV: envField.enum({
        context: "client",
        access: "public",
        values: ["development", "production"],
        default: "development",
      }),
    },
  },
  integrations: [
    sitemap({
      // 404、招待リンクの受け皿（/i/。noindex。SS-250）と、改定前のプライバシーポリシー・利用規約
      // （/privacy/2026-10-24/ のような版ごとのページ。noindex）を載せない。
      filter: (page) => {
        const { pathname } = new URL(page);
        return (
          !pathname.startsWith("/404") &&
          pathname !== "/i/" &&
          !/^\/(privacy|terms)\/\d{4}-\d{2}-\d{2}\/$/.test(pathname)
        );
      },
    }),
  ],
});
