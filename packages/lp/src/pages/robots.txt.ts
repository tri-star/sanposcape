import type { APIRoute } from "astro";
import { PUBLIC_LP_ENV } from "astro:env/client";

// production だけクローラーに公開する。dev.sanposcape.com などそれ以外の環境は
// 全体を Disallow にする（CloudFront の X-Robots-Tag・<meta name="robots"> と合わせた多重防御）。
export const GET: APIRoute = ({ site }) => {
  const body =
    PUBLIC_LP_ENV === "production"
      ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL("sitemap-index.xml", site).href}\n`
      : "User-agent: *\nDisallow: /\n";

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
