import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  S3UploadError,
  canRetryPhotoUpload,
  extractS3ErrorCode,
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
