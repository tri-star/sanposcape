#!/usr/bin/env node
// LP のデプロイ（.github/workflows/lp-deploy.yml）から呼ぶ。`_astro/` の旧ハッシュのアセットを引退・復帰させる（SS-166）。
// 判定は lib/stale-assets.mjs、ここは aws CLI（s3api）との受け渡しだけ。
//
//   node scripts/lp-tools/retire-stale-assets.mjs restore --bucket <名前> --dist <dist>
//     今回のビルドの `_astro/` にあるのに引退のタグが付いているものから、タグを外す（`_astro/` を上げた直後に呼ぶ）
//   node scripts/lp-tools/retire-stale-assets.mjs retire --bucket <名前> --dist <dist>
//     今回のビルドに無い `_astro/` のうち、まだ引退していないものに引退のタグを付ける（新しい HTML を配信した後に呼ぶ）
//
// public リポジトリの Actions のログに出るので、キーの一覧は出さず件数だけを出す（キー自体は公開しているファイル名）。
import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { parseArgs, promisify } from "node:util";

import {
  HASHED_PREFIX,
  copyInPlaceArgs,
  restoreReferenced,
  retireStale,
} from "./lib/stale-assets.mjs";

const execFileAsync = promisify(execFile);
const CONCURRENCY = 8;

const USAGE = `使い方: node scripts/lp-tools/retire-stale-assets.mjs <restore|retire> --bucket <バケット名> --dist <dist>`;

class AwsCliS3 {
  constructor(bucket) {
    this.bucket = bucket;
  }

  async #s3api(args) {
    const { stdout } = await execFileAsync(
      "aws",
      ["s3api", ...args, "--output", "json"],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    return stdout.trim() === "" ? null : JSON.parse(stdout);
  }

  async listKeys(prefix) {
    // CLI v2 はページをまたいで取得し、--query の結果を 1 つの配列にまとめる。0 件なら null。
    const keys = await this.#s3api([
      "list-objects-v2",
      "--bucket",
      this.bucket,
      "--prefix",
      prefix,
      "--query",
      "Contents[].Key",
    ]);
    return keys ?? [];
  }

  async getTags(key) {
    const result = await this.#s3api([
      "get-object-tagging",
      "--bucket",
      this.bucket,
      "--key",
      key,
    ]);
    return result?.TagSet ?? [];
  }

  async setTags(key, tagSet) {
    const target = ["--bucket", this.bucket, "--key", key];
    if (tagSet.length === 0) {
      await this.#s3api(["delete-object-tagging", ...target]);
    } else {
      await this.#s3api([
        "put-object-tagging",
        ...target,
        "--tagging",
        JSON.stringify({ TagSet: tagSet }),
      ]);
    }
  }

  async head(key) {
    return this.#s3api(["head-object", "--bucket", this.bucket, "--key", key]);
  }

  async copyInPlace({ key, head, tagSet }) {
    await this.#s3api(
      copyInPlaceArgs({ bucket: this.bucket, key, head, tagSet }),
    );
  }
}

/** dist/_astro 配下のファイルを、バケットのキー（`_astro/...`）の形で返す。 */
async function listBuildKeys(dist) {
  const root = join(dist, HASHED_PREFIX);
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map(
      (entry) =>
        HASHED_PREFIX +
        relative(root, join(entry.parentPath, entry.name)).split(sep).join("/"),
    )
    .sort();
}

function parseCommand(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      bucket: { type: "string" },
      dist: { type: "string" },
    },
    strict: true,
    allowPositionals: true,
  });
  const [mode] = positionals;
  if (
    positionals.length !== 1 ||
    !["restore", "retire"].includes(mode) ||
    !values.bucket ||
    !values.dist
  ) {
    throw new Error(USAGE);
  }
  return { mode, bucket: values.bucket, dist: resolve(values.dist) };
}

async function main() {
  const { mode, bucket, dist } = parseCommand(process.argv.slice(2));
  const adapter = new AwsCliS3(bucket);
  const buildKeys = await listBuildKeys(dist);
  if (buildKeys.length === 0) {
    // ビルドが空のまま全部を引退させないよう止める（dist の取り違えなど）。
    throw new Error(`${dist}/${HASHED_PREFIX} にファイルがありません`);
  }

  if (mode === "restore") {
    const { checked, restored } = await restoreReferenced({
      buildKeys,
      adapter,
      concurrency: CONCURRENCY,
    });
    console.log(
      `今回のビルドの ${checked} 件のうち、引退のタグを外したもの: ${restored.length} 件`,
    );
    return;
  }

  const remoteKeys = await adapter.listKeys(HASHED_PREFIX);
  const { stale, retired, alreadyRetired } = await retireStale({
    remoteKeys,
    buildKeys,
    adapter,
    concurrency: CONCURRENCY,
  });
  console.log(
    `今回のビルドに無いもの: ${stale} 件（新たに引退: ${retired.length} 件、引退済み: ${alreadyRetired} 件）`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
