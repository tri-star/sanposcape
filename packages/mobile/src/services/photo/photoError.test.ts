import { describe, expect, it } from "vitest";

import {
  PhotoError,
  isPhotoError,
  photoErrorMessage,
  toPhotoError,
} from "@/services/photo/photoError";
import type { PhotoErrorCode } from "@/services/photo/types";

describe("isPhotoError", () => {
  it("PhotoError を判定する", () => {
    expect(isPhotoError(new PhotoError("unknown"))).toBe(true);
  });

  it("PhotoError でない値は false", () => {
    expect(isPhotoError(new Error("boom"))).toBe(false);
    expect(isPhotoError(null)).toBe(false);
    expect(isPhotoError(undefined)).toBe(false);
  });
});

describe("toPhotoError", () => {
  it("既存の PhotoError はそのまま返る", () => {
    const original = new PhotoError("permission_denied");
    expect(toPhotoError(original, "unknown")).toBe(original);
  });

  it("任意の Error は fallback コードに正規化され、cause を保持する", () => {
    const original = new Error("boom");
    const result = toPhotoError(original, "processing_failed");

    expect(result.code).toBe("processing_failed");
    expect(result.message).toBe("boom");
    expect(result.cause).toBe(original);
  });

  it("Error でない値も正規化できる", () => {
    const result = toPhotoError("some string", "camera_unavailable");
    expect(result.code).toBe("camera_unavailable");
    expect(result.cause).toBe("some string");
  });
});

describe("photoErrorMessage", () => {
  const codes: PhotoErrorCode[] = [
    "permission_denied",
    "camera_unavailable",
    "processing_failed",
    "unknown",
  ];

  it.each(codes)("%s に文言がある", (code) => {
    expect(photoErrorMessage(code).length).toBeGreaterThan(0);
  });
});
