import type { UploadFileBody } from "@/services/photo/types";

/**
 * 直送する画像の実体。`services/photo` が組み立てたものをそのまま運ぶ
 * （**`{ uri, name, type }` に組み直さないこと**。理由は `UploadFileBody` の注記）。
 * 型だけの import なので、このモジュールは実行時に何も持ち込まない
 * （`presignedPostUpload.ts` を node の vitest で動かせる性質を壊さない）。
 */
export type UploadFilePart = UploadFileBody;
export type FormEntry = { name: string; value: string } | { name: "file"; file: UploadFilePart };

const EXCLUDED_FIELD_NAMES = new Set(["file", "acl", "x-amz-acl"]);

/**
 * presigned POST の multipart フォームに詰めるエントリ一覧を組み立てる。
 * `fields` の順を保ち、最後に `file` を置く（S3 の仕様。file より後のフィールドは無視される）。
 * `fields` 中に `file` / `acl` / `x-amz-acl`（大小無視）が紛れていても除外する
 * （backend の presigned POST の fields には acl を含めない方針。infra 申し送り）。
 */
export function buildPresignedPostFormEntries(
  fields: ReadonlyArray<[string, string]>,
  file: UploadFilePart,
): FormEntry[] {
  const entries: FormEntry[] = fields
    .filter(([name]) => !EXCLUDED_FIELD_NAMES.has(name.toLowerCase()))
    .map(([name, value]) => ({ name, value }));
  entries.push({ name: "file", file });
  return entries;
}

/** URL の scheme + host + port（既定ポートで補完）を返す。パース不能なら null。 */
function originOf(url: string): { protocol: string; hostname: string; port: string } | null {
  try {
    const parsed = new URL(url);
    const defaultPort =
      parsed.protocol === "https:" ? "443" : parsed.protocol === "http:" ? "80" : "";
    return {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || defaultPort,
    };
  } catch {
    return null;
  }
}

/**
 * 送信先 URL を許可するか。
 * - https: 常に許可（実 S3。バケットは DenyInsecureTransport）
 * - http: **apiBaseUrl も http で、かつ送信先の origin（scheme + host + port）が apiBaseUrl と一致する**
 *   ときだけ許可。backend の STORAGE_MODE=fake は `http://<リクエストされたホスト>/dev-storage/uploads`
 *   を返す（`request.base_url` 由来）ため、mobile が叩いている backend と同じ origin になる
 *   （Android エミュレータの 10.0.2.2:8000 も `getApiBaseUrl` の置換結果と一致する）。
 *   「http の任意ホスト」を許すより狭く保つ。
 * - それ以外のスキーム・パース不能は拒否。
 *
 * URL の origin 比較は `new URL()` の `protocol`/`hostname`/`port` を個別に比較する
 * （RN 0.86 の `URL` ポリフィルは `origin` プロパティの実装が不完全な場合があるため）。
 */
export function isAllowedUploadUrl(url: string, options: { apiBaseUrl: string }): boolean {
  const target = originOf(url);
  if (target === null) {
    return false;
  }
  if (target.protocol === "https:") {
    return true;
  }
  if (target.protocol !== "http:") {
    return false;
  }

  const base = originOf(options.apiBaseUrl);
  if (base === null || base.protocol !== "http:") {
    return false;
  }
  return target.hostname === base.hostname && target.port === base.port;
}

// NOTE: かつてここに `uploadFileName(localId)` があったが、ファイル名を呼び出し側で決める
// 手段が無くなったため削除した。`{ uri, name, type }` を渡せなくなり（`UploadFileBody` の
// 注記）、`FormData.append(name, blob, filename)` の第3引数も Expo の実装では
// `value instanceof Blob` のときしか効かない（`expo-file-system` の `File` は構造的に Blob を
// 満たすだけで instanceof を満たさないため無視される）。
// S3 の presigned POST は `key` フィールドで保存先が決まり、ファイル名は参照しないので実害は無い。
