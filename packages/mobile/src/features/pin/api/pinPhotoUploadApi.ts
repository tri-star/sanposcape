import { ApiError } from "@/api/apiError";
import {
  createPinPhotoUpload as createPinPhotoUploadRequest,
  deletePinPhotoUpload as deletePinPhotoUploadRequest,
} from "@/api/generated/endpoints/pins/pins";
import type { PinPhotoUploadRead } from "@/api/generated/model";
import type { PinPhotoUploadTicket } from "@/features/pin/types";
import type { PreparedPhoto } from "@/services/photo/types";

/**
 * `upload.fields`（`dict[str, str]`）を `Object.entries` で順序付き配列に変換する。
 * 文字列でない値があれば壊れた応答として `ApiError(502)` を投げる（バリデーションに近い扱い。
 * 通常の backend 応答では起こらない）。
 */
export function toPinPhotoUploadTicket(read: PinPhotoUploadRead): PinPhotoUploadTicket {
  const entries = Object.entries(read.upload.fields);
  for (const [, value] of entries) {
    if (typeof value !== "string") {
      throw new ApiError(502, "Invalid presigned upload fields");
    }
  }
  return {
    uploadId: read.upload_id,
    url: read.upload.url,
    fields: entries as Array<[string, string]>,
    expiresAt: read.expires_at,
    maxByteSize: read.max_byte_size,
  };
}

/**
 * `POST /pin-photo-uploads`。写真のアップロード枠（presigned POST）を発行する。
 * リクエストは `content_type` と `byte_size` のみ（幅・高さはサーバーがデコードして得る）。
 *
 * transport 層では再送しない（POST は `transientRetry` 対象外）。失敗時の再試行は
 * `usePinPhotos` / `runPinSave` が新しい枠を取り直して行う（古い枠は backend の期限切れ・
 * S3 staging のライフサイクルで消える）。
 */
export async function requestPinPhotoUpload(
  photo: Pick<PreparedPhoto, "byteSize" | "mimeType">,
  options?: { signal?: AbortSignal },
): Promise<PinPhotoUploadTicket> {
  const response = await createPinPhotoUploadRequest(
    { content_type: photo.mimeType, byte_size: photo.byteSize },
    { signal: options?.signal },
  );
  if (response.status === 201) {
    return toPinPhotoUploadTicket(response.data);
  }
  // customFetch は非2xx で ApiError を throw するため通常ここには来ない（型の網羅のため）。
  throw new ApiError(response.status);
}

/**
 * `DELETE /pin-photo-uploads/{upload_id}`（PR #93 T11）。`uploaded`（未紐付け）の写真を
 * 削除したときに best-effort で呼ぶ（`usePinPhotos.ts` の `removePhoto`）。
 *
 * 204 が成功。404（他人/存在しない/既に消滅）・409（既に attached）・422 は
 * `customFetch` が `ApiError` として throw する。呼び出し側はこの関数の失敗を「backend の
 * 枠がまだ残っているかもしれない」と解釈し、ローカルの未使用枠カウントを期限まで
 * 保有中のまま数え続けること（呼び出し側の責務。この関数自体は薄いラッパーに留める）。
 */
export async function deletePinPhotoUpload(
  uploadId: string,
  options?: { signal?: AbortSignal },
): Promise<void> {
  await deletePinPhotoUploadRequest(uploadId, { signal: options?.signal });
}
