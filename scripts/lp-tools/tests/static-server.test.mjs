import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

import {
  contentTypeOf,
  resolveRequestPath,
  startStaticServer,
} from "../lib/static-server.mjs";

describe("resolveRequestPath", () => {
  const root = "/srv/dist";

  test("末尾が / なら index.html を足す", () => {
    assert.equal(resolveRequestPath(root, "/"), "/srv/dist/index.html");
    assert.equal(
      resolveRequestPath(root, "/privacy/"),
      "/srv/dist/privacy/index.html",
    );
  });

  test("クエリと fragment は無視する", () => {
    assert.equal(
      resolveRequestPath(root, "/_astro/a.css?v=1#x"),
      "/srv/dist/_astro/a.css",
    );
  });

  test("エンコードされた文字を戻す", () => {
    assert.equal(
      resolveRequestPath(root, "/%E5%9C%B0%E5%9B%B3.png"),
      "/srv/dist/地図.png",
    );
  });

  test("URL として正規化される .. は root の中に収まる", () => {
    assert.equal(
      resolveRequestPath(root, "/%2e%2e/secret"),
      "/srv/dist/secret",
    );
    assert.equal(resolveRequestPath(root, "/a/../../../etc"), "/srv/dist/etc");
  });

  test("デコードした後に root の外を指すパスは null", () => {
    assert.equal(resolveRequestPath(root, "/..%2f..%2fetc/passwd"), null);
    assert.equal(resolveRequestPath(root, "/..%2fdist-other/x"), null);
  });

  test("壊れたエンコードと NUL は null", () => {
    assert.equal(resolveRequestPath(root, "/%E5"), null);
    assert.equal(resolveRequestPath(root, "/a%00.html"), null);
  });
});

test("contentTypeOf は拡張子から決め、知らないものは octet-stream", () => {
  assert.equal(contentTypeOf("a/index.html"), "text/html; charset=utf-8");
  assert.equal(contentTypeOf("a/b.WEBP"), "image/webp");
  assert.equal(
    contentTypeOf("a/apple-app-site-association"),
    "application/octet-stream",
  );
});

describe("startStaticServer", () => {
  let dir;
  let server;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "lp-tools-test-"));
    await mkdir(join(dir, "dist", "privacy"), { recursive: true });
    await writeFile(join(dir, "dist", "index.html"), "<p>top</p>");
    await writeFile(
      join(dir, "dist", "privacy", "index.html"),
      "<p>privacy</p>",
    );
    await writeFile(join(dir, "secret.txt"), "secret");
    server = await startStaticServer(join(dir, "dist"));
  });

  after(async () => {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  });

  test("127.0.0.1 で配信する", () => {
    assert.match(server.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  });

  test("ディレクトリは index.html を返す（末尾スラッシュの有無によらない）", async () => {
    for (const path of ["/", "/privacy/", "/privacy"]) {
      const response = await fetch(`${server.origin}${path}`);
      assert.equal(response.status, 200, path);
      assert.equal(
        response.headers.get("content-type"),
        "text/html; charset=utf-8",
      );
    }
    assert.equal(
      await (await fetch(`${server.origin}/privacy/`)).text(),
      "<p>privacy</p>",
    );
  });

  test("無いファイルは 404、dist の外は読ませない", async () => {
    assert.equal((await fetch(`${server.origin}/nothing.png`)).status, 404);
    const outside = await fetch(`${server.origin}/..%2fsecret.txt`);
    assert.equal(outside.status, 400);
    assert.notEqual(await outside.text(), "secret");
  });

  test("GET・HEAD 以外は 405", async () => {
    assert.equal(
      (await fetch(`${server.origin}/`, { method: "POST" })).status,
      405,
    );
  });
});
