import { isApiError } from "@/api/apiError";
import { isPhotoError } from "@/services/photo/photoError";

/** 写真1枚のアップロード失敗の分類（端末での加工・枠発行・直送の3段階）。 */
export type PhotoUploadErrorCode =
  | "too_large" // 加工後に上限超過 / 枠発行 413 / S3 の EntityTooLarge
  | "quota_exceeded" // 枠発行 409（ユーザー合計 1 GiB 超過）
  | "too_many_pending" // 枠発行 429（未使用枠が上限）。**UI には出さない**: 呼び出し側が「待機に戻す」に変換する
  | "storage_unavailable" // 枠発行 503（ストレージ未構成・障害）
  | "unauthorized" // 枠発行 401
  | "expired" // S3 403（署名期限切れ・ポリシー不一致）
  | "invalid_upload_url" // 送信先 URL が許可されない（fetch しない）
  | "processing_failed" // PhotoError("processing_failed")
  | "network"
  | "server" // 枠発行のその他 5xx / S3 5xx
  | "unknown";

export class S3UploadError extends Error {
  readonly isS3UploadError = true;

  constructor(
    readonly status: number,
    readonly s3Code: string | null,
  ) {
    super(s3Code ?? `S3 upload failed with status ${status}`);
    this.name = "S3UploadError";
  }
}

export function isS3UploadError(error: unknown): error is S3UploadError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { isS3UploadError?: boolean }).isS3UploadError === true
  );
}

const S3_CODE_PATTERN = /<Code>([^<]+)<\/Code>/;

/** S3 のエラー応答本文（XML）から `<Code>` の値を取り出す。無ければ null。 */
export function extractS3ErrorCode(body: string): string | null {
  return S3_CODE_PATTERN.exec(body)?.[1] ?? null;
}

/**
 * 任意の例外を PhotoUploadErrorCode に分類する（純粋。`instanceof` は TypeError 判定にのみ使う）。
 * `AbortError` は呼び出し側で握りつぶすので渡さないこと（分類対象外）。
 */
export function toPhotoUploadErrorCode(error: unknown): PhotoUploadErrorCode {
  if (isS3UploadError(error)) {
    if (error.s3Code === "InvalidUploadUrl") {
      return "invalid_upload_url";
    }
    if (error.s3Code === "EntityTooLarge") {
      return "too_large";
    }
    if (error.status === 403) {
      return "expired";
    }
    if (error.status >= 500) {
      return "server";
    }
    return "unknown";
  }

  if (isApiError(error)) {
    switch (error.status) {
      case 401:
        return "unauthorized";
      case 409:
        return "quota_exceeded";
      case 413:
        return "too_large";
      case 429:
        return "too_many_pending";
      case 503:
        return "storage_unavailable";
      default:
        return error.status >= 500 ? "server" : "unknown";
    }
  }

  if (isPhotoError(error)) {
    return "processing_failed";
  }

  if (error instanceof TypeError) {
    return "network";
  }

  return "unknown";
}

/**
 * ユーザー向け文言。`too_many_pending` は文言を持たない（429 はエラーとしてユーザーに見せず、
 * 呼び出し側が「待機に戻す」に変換するため）。容量の「1GB」は設定値が変わったら書き換えること
 * （サーバーから上限値を受け取る API は BK-8 で追加予定）。
 */
const MESSAGES: Record<Exclude<PhotoUploadErrorCode, "too_many_pending">, string> = {
  too_large: "写真のサイズが大きすぎます",
  quota_exceeded: "写真の保存容量（1人あたり1GB）の上限に達しました",
  storage_unavailable: "写真を保存できない状態です。時間をおいて再試行してください",
  unauthorized: "アップロードに失敗しました",
  expired: "アップロードに失敗しました",
  invalid_upload_url: "アップロード先が正しくありません",
  processing_failed: "写真の読み込みに失敗しました。別の写真でお試しください。",
  network: "アップロードに失敗しました",
  server: "アップロードに失敗しました",
  unknown: "アップロードに失敗しました",
};

export function photoUploadErrorMessage(
  code: Exclude<PhotoUploadErrorCode, "too_many_pending">,
): string {
  return MESSAGES[code];
}

const RETRIABLE_CODES = new Set<PhotoUploadErrorCode>([
  "network",
  "server",
  "expired",
  "storage_unavailable",
  "unknown",
]);

/** ユーザーが再試行ボタンを押して意味があるか。 */
export function canRetryPhotoUpload(code: PhotoUploadErrorCode): boolean {
  return RETRIABLE_CODES.has(code);
}

/**
 * 保存フローが「待機に戻して続きから送る」対象か（`canRetryPhotoUpload` と同じ集合）。
 * `isWaitablePhotoUploadError` と対で使う: 429（枠待ち）はこちらではなく `isWaitablePhotoUploadError`。
 */
export function isTransientPhotoUploadError(code: PhotoUploadErrorCode): boolean {
  return RETRIABLE_CODES.has(code);
}

/** 429（未使用枠が上限）か。保存フロー・先行アップロードが「待機に戻す」判定に使う唯一のコード。 */
export function isWaitablePhotoUploadError(code: PhotoUploadErrorCode): boolean {
  return code === "too_many_pending";
}
