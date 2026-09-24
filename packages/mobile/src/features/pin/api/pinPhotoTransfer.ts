import { ApiError } from "@/api/apiError";
import { uploadToPresignedPost } from "@/features/pin/api/presignedPostUpload";
import { requestPinPhotoUpload } from "@/features/pin/api/pinPhotoUploadApi";
import { logDiagnostic } from "@/lib/diagnosticLog";
import type { PreparedPhoto } from "@/services/photo/types";

/**
 * 写真1枚の「枠発行 → 上限確認 → 直送」。先行アップロード（`usePinPhotos`）と保存フロー
 * （`runPinSave`）で共用する。枠発行と直送を間を空けずに行い、発行済み・未送信の枠を
 * 持ち越さない（presigned POST は 600 秒で失効する）。
 *
 * 例外はそのまま投げる（分類は呼び出し側が `toPhotoUploadErrorCode` で行う）。
 */
export async function transferPinPhoto(
  input: { localId: string; prepared: PreparedPhoto },
  options: { signal?: AbortSignal; apiBaseUrl: string },
): Promise<string> {
  const ticket = await requestPinPhotoUpload(
    { byteSize: input.prepared.byteSize, mimeType: input.prepared.mimeType },
    { signal: options.signal },
  );

  // 直送の前に、backend が発行した枠の形を残す。backend 側のアクセスログ
  // （`upload_id=... key=...`）と `uploadId` で突き合わせられる。
  // ★ `fields` は**名前だけ**（値は policy・署名・一時認証情報を含む）。
  logDiagnostic("pin-photo.upload.start", {
    localId: input.localId,
    uploadId: ticket.uploadId,
    fieldNames: ticket.fields.map(([name]) => name),
    maxByteSize: ticket.maxByteSize,
    byteSize: input.prepared.byteSize,
    mimeType: input.prepared.mimeType,
    // 加工後ファイルの URI スキーム（RN のネットワーク層が読めるかの手掛かり。
    // パス自体は端末内の絶対パスなので出さない）。
    uriScheme: input.prepared.uri.split(":")[0],
  });

  if (input.prepared.byteSize > ticket.maxByteSize) {
    // 上限の正は枠発行応答の max_byte_size。枠は既に発行済みだが、直送しないことで
    // 無駄な S3 通信・失敗応答を避ける（枠自体は backend の紐付け期限で自然に失効する）。
    throw new ApiError(413);
  }

  await uploadToPresignedPost(ticket, input.prepared.file, {
    signal: options.signal,
    apiBaseUrl: options.apiBaseUrl,
  });

  return ticket.uploadId;
}
