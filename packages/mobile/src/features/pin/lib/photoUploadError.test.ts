import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  S3UploadError,
  canRetryPhotoUpload,
  extractS3ErrorCode,
  extractS3ErrorMessage,
  isAbortError,
  isTransientPhotoUploadError,
  isWaitablePhotoUploadError,
  photoUploadErrorMessage,
  toPhotoUploadErrorCode,
} from "@/features/pin/lib/photoUploadError";
import type { PhotoUploadErrorCode } from "@/features/pin/lib/photoUploadError";
import { PhotoError } from "@/services/photo/photoError";

describe("extractS3ErrorCode", () => {
  it("<Code>...</Code> を抽出する", () => {
    const body = "<Error><Code>EntityTooLarge</Code><Message>...</Message></Error>";
    expect(extractS3ErrorCode(body)).toBe("EntityTooLarge");
  });

  it("Code が無ければ null", () => {
    expect(extractS3ErrorCode("<Error></Error>")).toBeNull();
  });
});

describe("toPhotoUploadErrorCode", () => {
  it.each([
    [409, "quota_exceeded"],
    [401, "unauthorized"],
    [413, "too_large"],
    [429, "too_many_pending"],
    [503, "storage_unavailable"],
    [500, "server"],
  ] as const)("ApiError(%d) -> %s", (status, expected) => {
    expect(toPhotoUploadErrorCode(new ApiError(status))).toBe(expected);
  });

  it.each([
    ["EntityTooLarge", 400, "too_large"],
    ["InvalidUploadUrl", 0, "invalid_upload_url"],
    [null, 403, "expired"],
    [null, 500, "server"],
    ["AccessDenied", 403, "expired"],
  ] as const)("S3UploadError(%s, %d) -> %s", (s3Code, status, expected) => {
    expect(toPhotoUploadErrorCode(new S3UploadError(status, s3Code))).toBe(expected);
  });

  it("PhotoError -> processing_failed", () => {
    expect(toPhotoUploadErrorCode(new PhotoError("processing_failed"))).toBe("processing_failed");
  });

  it("TypeError -> network", () => {
    expect(toPhotoUploadErrorCode(new TypeError("Failed to fetch"))).toBe("network");
  });

  it("その他の例外 -> unknown", () => {
    expect(toPhotoUploadErrorCode(new Error("boom"))).toBe("unknown");
  });
});

describe("再試行可否", () => {
  const codes: PhotoUploadErrorCode[] = [
    "too_large",
    "quota_exceeded",
    "too_many_pending",
    "storage_unavailable",
    "unauthorized",
    "expired",
    "invalid_upload_url",
    "processing_failed",
    "network",
    "server",
    "unknown",
  ];
  const retriable = new Set<PhotoUploadErrorCode>([
    "network",
    "server",
    "expired",
    "storage_unavailable",
    "unknown",
  ]);

  it.each(codes)("%s の canRetryPhotoUpload / isTransientPhotoUploadError は一致する", (code) => {
    const expected = retriable.has(code);
    expect(canRetryPhotoUpload(code)).toBe(expected);
    expect(isTransientPhotoUploadError(code)).toBe(expected);
  });

  it("too_many_pending だけ isWaitablePhotoUploadError が true", () => {
    for (const code of codes) {
      expect(isWaitablePhotoUploadError(code)).toBe(code === "too_many_pending");
    }
  });
});

describe("photoUploadErrorMessage", () => {
  const codes: Exclude<PhotoUploadErrorCode, "too_many_pending">[] = [
    "too_large",
    "quota_exceeded",
    "storage_unavailable",
    "unauthorized",
    "expired",
    "invalid_upload_url",
    "processing_failed",
    "network",
    "server",
    "unknown",
  ];

  it.each(codes)("%s に文言がある", (code) => {
    expect(photoUploadErrorMessage(code).length).toBeGreaterThan(0);
  });
});

describe("extractS3ErrorMessage", () => {
  it("<Message> の値だけを返す", () => {
    const body = "<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>";

    expect(extractS3ErrorMessage(body)).toBe("Access Denied");
  });

  it("<Message> が無ければ null", () => {
    expect(extractS3ErrorMessage("<Error><Code>X</Code></Error>")).toBeNull();
  });

  it("署名対象文書（StringToSign など）を返さない（SS-88 の回帰）", () => {
    // SignatureDoesNotMatch の実応答を模した本文。`<StringToSign>` は presigned POST の
    // policy(base64) そのもので、復号すると一時認証情報を含む（dev バケットで実測済み）。
    const body =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      "<Error><Code>SignatureDoesNotMatch</Code>" +
      "<Message>The request signature we calculated does not match.</Message>" +
      "<AWSAccessKeyId>ASIAEXAMPLEKEYID</AWSAccessKeyId>" +
      "<StringToSign>eyJleHBpcmF0aW9uIjogIlNFQ1JFVCJ9</StringToSign>" +
      "<StringToSignBytes>7b 22 65</StringToSignBytes>" +
      "<SignatureProvided>deadbeef</SignatureProvided></Error>";

    const message = extractS3ErrorMessage(body);

    expect(message).toBe("The request signature we calculated does not match.");
    expect(message).not.toContain("eyJleHBpcmF0aW9u");
    expect(message).not.toContain("ASIAEXAMPLEKEYID");
  });
});

describe("isAbortError", () => {
  it("name が AbortError の Error を中断と判定する", () => {
    const error = new Error("Aborted");
    error.name = "AbortError";

    expect(isAbortError(error)).toBe(true);
  });

  it("withTimeout のタイムアウト（TypeError）は中断ではない", () => {
    expect(isAbortError(new TypeError("Pin photo transfer timed out"))).toBe(false);
  });

  it("RN の通信失敗（TypeError）も中断ではない", () => {
    expect(isAbortError(new TypeError("Network request failed"))).toBe(false);
  });

  it("Error でない値でも落ちない", () => {
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});
