import type { APIRoute } from "astro";
import { PUBLIC_LP_ENV } from "astro:env/client";

// production だけ sitemap を案内する。dev.sanposcape.com などそれ以外の環境も Disallow にはしない。
// Disallow するとクローラーがページを取得できず <meta name="robots"> や CloudFront の
// X-Robots-Tag: noindex を読めないため、外部からリンクされた URL が「内容なし」で
// インデックスされうる。インデックスの抑止は noindex に任せる。
export const GET: APIRoute = ({ site }) => {
  const body =
    PUBLIC_LP_ENV === "production"
      ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL("sitemap-index.xml", site).href}\n`
      : "User-agent: *\nAllow: /\n";

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
