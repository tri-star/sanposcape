// LP の `_astro/`（ハッシュ付きアセット）のうち、今回のビルドに無いものを「引退」させ、
// 再び参照されたものを「復帰」させる（SS-166。ADR-012 の SS-166 追補）。
//
// 削除そのものは infra の S3 Lifecycle ルール（prefix `_astro/` かつタグ `lp-retired=true` → N 日で expire）が行う。
// Lifecycle の期限はオブジェクトの作成日時から数えるので、引退させるときは同じキーへコピーし直して作成日時を引退の日にする。
// - 既に引退済み（タグ付き）のものはコピーし直さない。毎回コピーすると作成日時が延び続け、期限が来ない。
// - ビルドにあるのにタグが付いているもの（ロールバックで再び参照されたもの）はタグを外す。
//   `aws s3 sync` はサイズが同じで S3 の方が新しいファイルを上げ直さないため、上げ直しでタグが外れることには頼らない。
//
// S3 の操作は `adapter`（retire-stale-assets.mjs の AwsCliS3。テストでは偽物）に任せ、ここには判定だけを置く。

export const HASHED_PREFIX = "_astro/";
export const RETIRED_TAG = Object.freeze({ Key: "lp-retired", Value: "true" });

/** @typedef {{ Key: string, Value: string }} Tag */

/** @param {Tag[]} tagSet */
export function isRetired(tagSet) {
  return tagSet.some(
    (tag) => tag.Key === RETIRED_TAG.Key && tag.Value === RETIRED_TAG.Value,
  );
}

/** 引退のタグだけを除く（他のタグは残す）。 @param {Tag[]} tagSet */
export function withoutRetired(tagSet) {
  return tagSet.filter((tag) => tag.Key !== RETIRED_TAG.Key);
}

/** 引退のタグを付けた（既存の同名のタグは置き換えた）タグの組。 @param {Tag[]} tagSet */
export function withRetired(tagSet) {
  return [...withoutRetired(tagSet), { ...RETIRED_TAG }];
}

/** copy-object の `--tagging` に渡す URL クエリの形。 @param {Tag[]} tagSet */
export function toTaggingQuery(tagSet) {
  return tagSet
    .map(
      (tag) =>
        `${encodeURIComponent(tag.Key)}=${encodeURIComponent(tag.Value)}`,
    )
    .join("&");
}

/** バケットにある `_astro/` のキーのうち、今回のビルドに無いもの。 */
export function staleKeys(remoteKeys, buildKeys) {
  const build = new Set(buildKeys);
  return remoteKeys
    .filter((key) => key.startsWith(HASHED_PREFIX) && !build.has(key))
    .sort();
}

/**
 * 同じキーへコピーし直すときの copy-object の引数（`aws s3api` の後ろ）。
 * `--metadata-directive REPLACE` にしないと「自分自身へのコピー」として拒まれるので、
 * head-object で読んだ Content-Type・Cache-Control などを付け直して、配信の挙動を変えない。
 * `--copy-source-if-match` で、head-object の後に上書きされたもの（同じキーの別の内容）は引退させない。
 * `--copy-source` のキーはエンコードせずに渡す（aws CLI（botocore）がヘッダーに載せるときにエンコードするので、
 * ここでもエンコードすると二重になり、空白や日本語を含むキーが NoSuchKey になる）。
 *
 * @param {{ bucket: string, key: string, head: Record<string, any>, tagSet: Tag[] }} params
 */
export function copyInPlaceArgs({ bucket, key, head, tagSet }) {
  const source = `${bucket}/${key}`;
  const args = [
    "copy-object",
    "--bucket",
    bucket,
    "--key",
    key,
    "--copy-source",
    source,
    "--copy-source-if-match",
    head.ETag,
    "--metadata-directive",
    "REPLACE",
    "--tagging-directive",
    "REPLACE",
    "--tagging",
    toTaggingQuery(withRetired(tagSet)),
  ];
  const headers = [
    ["ContentType", "--content-type"],
    ["CacheControl", "--cache-control"],
    ["ContentEncoding", "--content-encoding"],
    ["ContentDisposition", "--content-disposition"],
    ["ContentLanguage", "--content-language"],
    ["StorageClass", "--storage-class"],
    ["WebsiteRedirectLocation", "--website-redirect-location"],
  ];
  for (const [field, flag] of headers) {
    if (head[field]) args.push(flag, head[field]);
  }
  if (head.Metadata && Object.keys(head.Metadata).length > 0) {
    args.push("--metadata", JSON.stringify(head.Metadata));
  }
  // 既定の暗号化（SSE-S3）はバケットの設定で付く。KMS の鍵を指定していたものだけ引き継ぐ。
  if (head.ServerSideEncryption === "aws:kms") {
    args.push("--server-side-encryption", "aws:kms");
    if (head.SSEKMSKeyId) args.push("--ssekms-key-id", head.SSEKMSKeyId);
  }
  return args;
}

/**
 * items を最大 limit 件ずつ並行して処理する。1 件の失敗で残りを止めず、最後にまとめて投げる。
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<void>} fn
 */
export async function forEachConcurrently(items, limit, fn) {
  const failures = [];
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch (error) {
        failures.push({ item, error });
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  if (failures.length > 0) {
    const detail = failures
      .map(({ item, error }) => `- ${item}: ${error.message}`)
      .join("\n");
    throw new Error(`${failures.length} 件の処理に失敗しました\n${detail}`);
  }
}

/**
 * 今回のビルドにあるのに引退のタグが付いているものから、タグを外す。
 * @returns {Promise<{ checked: number, restored: string[] }>}
 */
export async function restoreReferenced({ buildKeys, adapter, concurrency }) {
  const restored = [];
  await forEachConcurrently(buildKeys, concurrency, async (key) => {
    const tagSet = await adapter.getTags(key);
    if (!isRetired(tagSet)) return;
    await adapter.setTags(key, withoutRetired(tagSet));
    restored.push(key);
  });
  return { checked: buildKeys.length, restored: restored.sort() };
}

/**
 * 今回のビルドに無く、まだ引退していないものを、同じキーへコピーし直して引退のタグを付ける。
 * @returns {Promise<{ stale: number, retired: string[], alreadyRetired: number }>}
 */
export async function retireStale({
  remoteKeys,
  buildKeys,
  adapter,
  concurrency,
}) {
  const stale = staleKeys(remoteKeys, buildKeys);
  const retired = [];
  let alreadyRetired = 0;
  await forEachConcurrently(stale, concurrency, async (key) => {
    const tagSet = await adapter.getTags(key);
    if (isRetired(tagSet)) {
      alreadyRetired += 1;
      return;
    }
    const head = await adapter.head(key);
    await adapter.copyInPlace({ key, head, tagSet });
    retired.push(key);
  });
  return { stale: stale.length, retired: retired.sort(), alreadyRetired };
}
