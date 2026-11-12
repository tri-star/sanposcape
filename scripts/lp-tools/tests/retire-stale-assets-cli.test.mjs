// retire-stale-assets.mjs を、PATH の先頭に置いた偽の `aws` で動かす。
// 偽の aws は state.json（キー → { tags, head }）を読み書きし、呼ばれた引数を calls.jsonl に残す。
// 書き換える操作が並行しないデータにする（偽の aws はファイルを排他しない）。
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, test } from "node:test";

const execFileAsync = promisify(execFile);
const SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../retire-stale-assets.mjs",
);

const FAKE_AWS = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const dir = path.dirname(process.argv[1]);
const statePath = path.join(dir, "state.json");
const args = process.argv.slice(2);
fs.appendFileSync(path.join(dir, "calls.jsonl"), JSON.stringify(args) + "\\n");
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const opt = (name) => args[args.indexOf(name) + 1];
const [, op] = args;
const out = (value) => process.stdout.write(JSON.stringify(value));
const key = opt("--key");
switch (op) {
  case "list-objects-v2": {
    const keys = Object.keys(state).filter((k) => k.startsWith(opt("--prefix")));
    out(keys.length ? keys : null);
    break;
  }
  case "get-object-tagging":
    out({ TagSet: state[key].tags });
    break;
  case "head-object":
    out(state[key].head);
    break;
  case "put-object-tagging":
    state[key].tags = JSON.parse(opt("--tagging")).TagSet;
    break;
  case "delete-object-tagging":
    state[key].tags = [];
    break;
  case "copy-object":
    if (opt("--copy-source-if-match") !== state[key].head.ETag) {
      process.stderr.write("PreconditionFailed");
      process.exit(254);
    }
    state[key].tags = opt("--tagging").split("&").map((pair) => {
      const [Key, Value] = pair.split("=").map(decodeURIComponent);
      return { Key, Value };
    });
    out({ CopyObjectResult: {} });
    break;
  default:
    process.stderr.write("unknown " + op);
    process.exit(2);
}
// 読むだけの操作では書き戻さない（スクリプトは並行して呼ぶので、書き戻すと他の呼び出しの変更を消しうる）
if (["put-object-tagging", "delete-object-tagging", "copy-object"].includes(op)) {
  fs.writeFileSync(statePath, JSON.stringify(state));
}
`;

describe("retire-stale-assets.mjs", () => {
  let work;
  let binDir;
  let dist;

  const object = (tags = []) => ({
    tags,
    head: { ETag: '"e"', ContentType: "text/css", CacheControl: "immutable" },
  });

  async function run(mode, state, distDir = dist) {
    await writeFile(join(binDir, "state.json"), JSON.stringify(state));
    await writeFile(join(binDir, "calls.jsonl"), "");
    const { stdout } = await execFileAsync(
      process.execPath,
      [SCRIPT, mode, "--bucket", "bucket", "--dist", distDir],
      {
        env: {
          ...process.env,
          PATH: `${binDir}${delimiter}${process.env.PATH}`,
        },
      },
    );
    const calls = (await readFile(join(binDir, "calls.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const after = JSON.parse(
      await readFile(join(binDir, "state.json"), "utf8"),
    );
    return { stdout, calls, after };
  }

  beforeEach(async () => {
    work = await mkdtemp(join(tmpdir(), "retire-stale-assets-"));
    binDir = join(work, "bin");
    dist = join(work, "dist");
    await mkdir(binDir);
    await mkdir(join(dist, "_astro", "img"), { recursive: true });
    await writeFile(join(dist, "_astro", "new.css"), "a");
    await writeFile(join(dist, "_astro", "img", "new.webp"), "b");
    await writeFile(join(dist, "index.html"), "c");
    await writeFile(join(binDir, "aws"), FAKE_AWS);
    await chmod(join(binDir, "aws"), 0o755);
  });

  afterEach(async () => {
    await rm(work, { recursive: true, force: true });
  });

  test("retire: ビルドに無いものに引退のタグを付け、メタデータを付け直してコピーする", async () => {
    const { stdout, calls, after } = await run("retire", {
      "_astro/new.css": object(),
      "_astro/img/new.webp": object(),
      "_astro/old.css": object(),
      "_astro/gone.js": object([{ Key: "lp-retired", Value: "true" }]),
    });
    assert.match(
      stdout,
      /今回のビルドに無いもの: 2 件（新たに引退: 1 件、引退済み: 1 件）/,
    );
    assert.deepEqual(after["_astro/old.css"].tags, [
      { Key: "lp-retired", Value: "true" },
    ]);
    assert.deepEqual(after["_astro/new.css"].tags, []);
    assert.deepEqual(after["_astro/img/new.webp"].tags, []);
    const copy = calls.find((args) => args[1] === "copy-object");
    assert.equal(copy[copy.indexOf("--content-type") + 1], "text/css");
    assert.equal(copy[copy.indexOf("--cache-control") + 1], "immutable");
    assert.ok(
      calls.every((args) => args[0] === "s3api" && args.at(-1) === "json"),
    );
  });

  test("restore: ビルドにあって引退のタグが付いているものからタグを外す", async () => {
    const { stdout, after } = await run("restore", {
      "_astro/new.css": object([{ Key: "lp-retired", Value: "true" }]),
      "_astro/img/new.webp": object([{ Key: "owner", Value: "lp" }]),
      "_astro/old.css": object([{ Key: "lp-retired", Value: "true" }]),
    });
    assert.match(
      stdout,
      /今回のビルドの 2 件のうち、引退のタグを外したもの: 1 件/,
    );
    assert.deepEqual(after["_astro/new.css"].tags, []);
    assert.deepEqual(after["_astro/img/new.webp"].tags, [
      { Key: "owner", Value: "lp" },
    ]);
    // ビルドに無いものは restore では触らない
    assert.deepEqual(after["_astro/old.css"].tags, [
      { Key: "lp-retired", Value: "true" },
    ]);
  });

  test("dist の _astro/ が空なら、何も引退させずに失敗する", async () => {
    const empty = join(work, "empty");
    await mkdir(join(empty, "_astro"), { recursive: true });
    await assert.rejects(
      run("retire", { "_astro/old.css": object() }, empty),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /ファイルがありません/);
        return true;
      },
    );
  });

  test("引数が足りなければ使い方を出して失敗する", async () => {
    await assert.rejects(
      execFileAsync(process.execPath, [SCRIPT, "retire", "--bucket", "b"]),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /使い方/);
        return true;
      },
    );
  });
});
