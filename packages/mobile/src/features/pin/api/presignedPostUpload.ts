import { S3UploadError, extractS3ErrorCode } from "@/features/pin/lib/photoUploadError";
import type { UploadFilePart } from "@/features/pin/lib/presignedPostForm";
import {
  buildPresignedPostFormEntries,
  isAllowedUploadUrl,
} from "@/features/pin/lib/presignedPostForm";
import type { PinPhotoUploadTicket } from "@/features/pin/types";

/**
 * S3（または backend の fake storage）への presigned POST 直送。
 *
 * `customFetch` を**意図的に使わない**理由:
 * (1) backend 以外のオリジン（S3）に `X-App-Authorization` を送らない
 * (2) `x-amz-content-sha256` は CloudFront(OAC) 用の契約で presigned POST には不要
 * (3) ベース URL・401→refresh・`transientRetry` は backend 用の関心事で、この経路には当てはまらない
 *
 * fake storage（backend の `/dev-storage`）も同じ経路で送る（認証不要・署名はフォームの
 * `x-fake-signature` で完結する）。`react-native` を値 import しないため node の vitest で
 * msw を使ってテストできる。
 */
export async function uploadToPresignedPost(
  ticket: Pick<PinPhotoUploadTicket, "url" | "fields">,
  file: UploadFilePart,
  options: { signal?: AbortSignal; apiBaseUrl: string },
): Promise<void> {
  if (!isAllowedUploadUrl(ticket.url, { apiBaseUrl: options.apiBaseUrl })) {
    throw new S3UploadError(0, "InvalidUploadUrl");
  }

  const form = new FormData();
  for (const entry of buildPresignedPostFormEntries(ticket.fields, file)) {
    if ("value" in entry) {
      form.append(entry.name, entry.value);
    } else {
      // RN の `{ uri, name, type }` は Web の `Blob` と型が異なるが、RN の `FormData`/`fetch`
      // 実装（XHR ベースのポリフィル）はこの形をファイルパートとして解釈する。
      form.append(entry.name, entry.file as unknown as Blob);
    }
  }

  // ヘッダーを一切付けない（`Content-Type` を明示すると multipart の boundary が壊れる）。
  // `redirect: "manual"` は Web / react-native-web、および Node（vitest の msw 環境）の spec 準拠
  // fetch では効くが、RN 実機では **best-effort**（PR #93 T1: レビュー指摘どおり、実機では
  // 実効的な防御にならない）。理由（`@/api/client.ts` の `redirect: "error"` と同じ既知の制約）:
  // RN 0.86 のグローバル fetch は `whatwg-fetch`（XHR ベースのポリフィル）の再エクスポートで、
  // `Request` は `options.redirect` を読まないため実機ではリダイレクトが常に追従される。
  // 実機での実効的な防御は次の2点に依る（多層防御のもう1枚として `redirect: "manual"` も残す）:
  // (1) 送信先 URL の検証（`isAllowedUploadUrl`）で S3 のリージョナルエンドポイント・fake storage
  //     の同一オリジンに限定していること、(2) S3 の presigned POST 自体が正常系で3xxを返す
  //     経路を持たない署名の制約（別オリジンへ誘導するリダイレクトを返せない）。
  const response = await fetch(ticket.url, {
    method: "POST",
    body: form,
    signal: options.signal,
    redirect: "manual",
  });

  // `redirect: "manual"` が効く環境では 3xx は `type: "opaqueredirect"`（status は仕様上 0）になり
  // 本文を読めない。リダイレクトはすべて失敗として扱う。
  if (response.type === "opaqueredirect") {
    throw new S3UploadError(0, "Redirected");
  }

  // backend 契約上の成功は 204 だが、2xx は広く成功として扱う。
  if (response.status >= 200 && response.status < 300) {
    return;
  }

  // manual でも 3xx がそのまま観測される環境（一部ポリフィル）への保険。
  if (response.status >= 300 && response.status < 400) {
    throw new S3UploadError(response.status, "Redirected");
  }

  const body = await response.text().catch(() => "");
  throw new S3UploadError(response.status, extractS3ErrorCode(body));
}
