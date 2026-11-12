import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  copyInPlaceArgs,
  forEachConcurrently,
  isRetired,
  restoreReferenced,
  retireStale,
  staleKeys,
  toTaggingQuery,
  withRetired,
  withoutRetired,
} from "../lib/stale-assets.mjs";

const RETIRED = { Key: "lp-retired", Value: "true" };
const OTHER = { Key: "owner", Value: "lp" };

/** S3 の偽物。tags: キー → タグの組。呼ばれた操作を calls に残す。 */
function fakeAdapter(tags, { failOn } = {}) {
  const calls = [];
  return {
    calls,
    async getTags(key) {
      if (key === failOn) throw new Error("AccessDenied");
      calls.push(["getTags", key]);
      return tags[key] ?? [];
    },
    async setTags(key, tagSet) {
      calls.push(["setTags", key, tagSet]);
      tags[key] = tagSet;
    },
    async head(key) {
      calls.push(["head", key]);
      return { ETag: `"etag-${key}"`, ContentType: "text/css" };
    },
    async copyInPlace({ key, head, tagSet }) {
      calls.push(["copyInPlace", key, head.ETag, tagSet]);
      tags[key] = withRetired(tagSet);
    },
  };
}

describe("タグの判定", () => {
  test("lp-retired=true のときだけ引退済み", () => {
    assert.equal(isRetired([RETIRED]), true);
    assert.equal(isRetired([OTHER, RETIRED]), true);
    assert.equal(isRetired([{ Key: "lp-retired", Value: "false" }]), false);
    assert.equal(isRetired([OTHER]), false);
    assert.equal(isRetired([]), false);
  });

  test("引退のタグの付け外しで他のタグを残す", () => {
    assert.deepEqual(withoutRetired([OTHER, RETIRED]), [OTHER]);
    assert.deepEqual(withRetired([OTHER]), [OTHER, RETIRED]);
    assert.deepEqual(
      withRetired([{ Key: "lp-retired", Value: "false" }, OTHER]),
      [OTHER, RETIRED],
    );
  });

  test("--tagging のクエリは URL エンコードする", () => {
    assert.equal(
      toTaggingQuery([RETIRED, { Key: "a b", Value: "x&y" }]),
      "lp-retired=true&a%20b=x%26y",
    );
  });
});

describe("staleKeys", () => {
  test("ビルドに無い _astro/ のキーだけを返す", () => {
    assert.deepEqual(
      staleKeys(
        [
          "_astro/new.css",
          "_astro/old.js",
          "index.html",
          "_astro/img/old.webp",
        ],
        ["_astro/new.css"],
      ),
      ["_astro/img/old.webp", "_astro/old.js"],
    );
  });
});

describe("copyInPlaceArgs", () => {
  test("配信に効くメタデータを付け直し、ETag で上書きされていないことを条件にする", () => {
    const args = copyInPlaceArgs({
      bucket: "bucket",
      key: "_astro/index.B1c_2.css",
      head: {
        ETag: '"abc"',
        ContentType: "text/css",
        CacheControl: "public, max-age=31536000, immutable",
        Metadata: {},
        ServerSideEncryption: "AES256",
      },
      tagSet: [OTHER],
    });
    assert.deepEqual(args, [
      "copy-object",
      "--bucket",
      "bucket",
      "--key",
      "_astro/index.B1c_2.css",
      "--copy-source",
      "bucket/_astro/index.B1c_2.css",
      "--copy-source-if-match",
      '"abc"',
      "--metadata-directive",
      "REPLACE",
      "--tagging-directive",
      "REPLACE",
      "--tagging",
      "owner=lp&lp-retired=true",
      "--content-type",
      "text/css",
      "--cache-control",
      "public, max-age=31536000, immutable",
    ]);
  });

  test("ユーザー定義のメタデータと KMS の鍵を引き継ぎ、コピー元のキーはエンコードしない（aws CLI がエンコードする）", () => {
    const args = copyInPlaceArgs({
      bucket: "bucket",
      key: "_astro/a b+c.js",
      head: {
        ETag: '"e"',
        Metadata: { origin: "build" },
        ServerSideEncryption: "aws:kms",
        SSEKMSKeyId: "arn:aws:kms:ap-southeast-1:0:key/k",
      },
      tagSet: [],
    });
    assert.equal(
      args[args.indexOf("--copy-source") + 1],
      "bucket/_astro/a b+c.js",
    );
    assert.equal(args[args.indexOf("--tagging") + 1], "lp-retired=true");
    assert.equal(args[args.indexOf("--metadata") + 1], '{"origin":"build"}');
    assert.equal(args[args.indexOf("--server-side-encryption") + 1], "aws:kms");
    assert.equal(
      args[args.indexOf("--ssekms-key-id") + 1],
      "arn:aws:kms:ap-southeast-1:0:key/k",
    );
  });
});

describe("retireStale", () => {
  test("ビルドに無く、まだ引退していないものだけをコピーし直す", async () => {
    const adapter = fakeAdapter({
      "_astro/already.js": [RETIRED],
      "_astro/old.css": [OTHER],
    });
    const result = await retireStale({
      remoteKeys: [
        "_astro/current.css",
        "_astro/old.css",
        "_astro/old.js",
        "_astro/already.js",
      ],
      buildKeys: ["_astro/current.css"],
      adapter,
      concurrency: 2,
    });
    assert.deepEqual(result, {
      stale: 3,
      retired: ["_astro/old.css", "_astro/old.js"],
      alreadyRetired: 1,
    });
    // 引退済みのものはコピーし直さない（作成日時を延ばさない）。ビルドにあるものには触れない。
    const copied = adapter.calls.filter(([op]) => op === "copyInPlace");
    assert.deepEqual(copied.map(([, key]) => key).sort(), [
      "_astro/old.css",
      "_astro/old.js",
    ]);
    assert.ok(!adapter.calls.some(([, key]) => key === "_astro/current.css"));
    // 既存のタグは保ち、head-object の ETag を条件にコピーする。
    const oldCss = copied.find(([, key]) => key === "_astro/old.css");
    assert.deepEqual(oldCss, [
      "copyInPlace",
      "_astro/old.css",
      '"etag-_astro/old.css"',
      [OTHER],
    ]);
  });

  test("2 回目のデプロイでは何もコピーしない", async () => {
    const tags = {};
    const params = {
      remoteKeys: ["_astro/current.css", "_astro/old.css"],
      buildKeys: ["_astro/current.css"],
      concurrency: 4,
    };
    await retireStale({ ...params, adapter: fakeAdapter(tags) });
    const second = fakeAdapter(tags);
    const result = await retireStale({ ...params, adapter: second });
    assert.deepEqual(result, { stale: 1, retired: [], alreadyRetired: 1 });
    assert.ok(!second.calls.some(([op]) => op === "copyInPlace"));
  });
});

describe("restoreReferenced", () => {
  test("ビルドにあって引退のタグが付いているものだけ、タグを外す", async () => {
    const adapter = fakeAdapter({
      "_astro/back.css": [OTHER, RETIRED],
      "_astro/back.js": [RETIRED],
      "_astro/live.css": [OTHER],
    });
    const result = await restoreReferenced({
      buildKeys: ["_astro/back.css", "_astro/back.js", "_astro/live.css"],
      adapter,
      concurrency: 2,
    });
    assert.deepEqual(result, {
      checked: 3,
      restored: ["_astro/back.css", "_astro/back.js"],
    });
    const setTags = adapter.calls.filter(([op]) => op === "setTags");
    assert.deepEqual(setTags.sort(), [
      ["setTags", "_astro/back.css", [OTHER]],
      ["setTags", "_astro/back.js", []],
    ]);
  });
});

describe("forEachConcurrently", () => {
  test("同時に limit 件までしか走らせない", async () => {
    let running = 0;
    let peak = 0;
    await forEachConcurrently([1, 2, 3, 4, 5], 2, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
    });
    assert.equal(peak, 2);
  });

  test("失敗しても残りを処理し、最後にまとめて投げる", async () => {
    const adapter = fakeAdapter({}, { failOn: "_astro/b.js" });
    await assert.rejects(
      retireStale({
        remoteKeys: ["_astro/a.js", "_astro/b.js", "_astro/c.js"],
        buildKeys: [],
        adapter,
        concurrency: 1,
      }),
      /1 件の処理に失敗しました\n- _astro\/b\.js: AccessDenied/,
    );
    const copied = adapter.calls.filter(([op]) => op === "copyInPlace");
    assert.deepEqual(
      copied.map(([, key]) => key),
      ["_astro/a.js", "_astro/c.js"],
    );
  });

  test("失敗が多いときは先頭の 10 件だけを出す", async () => {
    const items = Array.from({ length: 12 }, (_, i) => `k${i}`);
    await assert.rejects(
      forEachConcurrently(items, 4, async () => {
        throw new Error("AccessDenied");
      }),
      (error) => {
        assert.match(error.message, /^12 件の処理に失敗しました\n/);
        assert.equal(
          error.message.match(/^- k\d+: AccessDenied$/gm).length,
          10,
        );
        assert.match(error.message, /（ほか 2 件）$/);
        return true;
      },
    );
  });

  test("空なら何もしない", async () => {
    await forEachConcurrently([], 4, async () => {
      throw new Error("呼ばれない");
    });
  });
});
