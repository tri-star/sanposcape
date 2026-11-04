// `packages/lp/dist` を 127.0.0.1 の空きポートで配信する。撮影のためだけの最小限のサーバー。
// LP の出力は `/_astro/...` の絶対パスで参照するため、file:// ではなく HTTP で開く。
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

/**
 * URL のパスを、配信するファイルのパスに直す。root の外を指すもの（`..` など）は null。
 * 末尾が `/` のときは `index.html` を足す（Astro の `build.format: "directory"`）。
 */
export function resolveRequestPath(root, urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(urlPath, "http://localhost").pathname,
    );
  } catch {
    return null;
  }
  if (pathname.includes("\0")) return null;
  if (pathname.endsWith("/")) pathname += "index.html";
  const absoluteRoot = resolve(root);
  const filePath = resolve(join(absoluteRoot, pathname));
  if (filePath !== absoluteRoot && !filePath.startsWith(absoluteRoot + sep))
    return null;
  return filePath;
}

export function contentTypeOf(filePath) {
  return (
    CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream"
  );
}

async function handle(root, request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405).end();
    return;
  }
  let filePath = resolveRequestPath(root, request.url ?? "/");
  if (!filePath) {
    response.writeHead(400).end();
    return;
  }
  try {
    if ((await stat(filePath)).isDirectory())
      filePath = join(filePath, "index.html");
    const body = await readFile(filePath);
    response.writeHead(200, { "content-type": contentTypeOf(filePath) });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response
      .writeHead(404, { "content-type": "text/plain; charset=utf-8" })
      .end("not found");
  }
}

/** 配信を始め、`{ origin, close }` を返す。ポートは OS に選ばせる。 */
export async function startStaticServer(root) {
  const server = createServer((request, response) => {
    handle(root, request, response).catch(() => response.writeHead(500).end());
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolvePromise) => {
        server.closeAllConnections();
        server.close(() => resolvePromise());
      }),
  };
}
