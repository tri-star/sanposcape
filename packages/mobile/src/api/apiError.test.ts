import { describe, expect, it } from "vitest";

import { ApiError, getApiErrorCode, isApiError } from "@/api/apiError";

describe("ApiError", () => {
  it("既定メッセージは既存の client.ts と同じ形式になる", () => {
    expect(new ApiError(500).message).toBe("HTTP error! status: 500");
  });

  it("メッセージを明示指定できる", () => {
    expect(new ApiError(401, "unauthorized").message).toBe("unauthorized");
  });

  it("body（PR #93 T15）を保持できる", () => {
    const error = new ApiError(409, undefined, { detail: "x", code: "storage_quota_exceeded" });
    expect(error.body).toEqual({ detail: "x", code: "storage_quota_exceeded" });
  });

  it("body 省略時は undefined（既存呼び出し側との互換）", () => {
    expect(new ApiError(500).body).toBeUndefined();
  });
});

describe("getApiErrorCode", () => {
  it("body.code が文字列ならその値を返す", () => {
    const error = new ApiError(409, undefined, { code: "photo_upload_not_ready" });
    expect(getApiErrorCode(error)).toBe("photo_upload_not_ready");
  });

  it("body が無い ApiError は null", () => {
    expect(getApiErrorCode(new ApiError(409))).toBeNull();
  });

  it("body.code が文字列でない場合は null", () => {
    const error = new ApiError(409, undefined, { code: 123 });
    expect(getApiErrorCode(error)).toBeNull();
  });

  it("body がオブジェクトでない場合は null", () => {
    const error = new ApiError(409, undefined, "plain text");
    expect(getApiErrorCode(error)).toBeNull();
  });

  it("ApiError でない場合は null", () => {
    expect(getApiErrorCode(new Error("boom"))).toBeNull();
    expect(getApiErrorCode(null)).toBeNull();
  });
});

describe("isApiError", () => {
  it("ApiError インスタンスは true", () => {
    expect(isApiError(new ApiError(401))).toBe(true);
  });

  it("通常の Error は false", () => {
    expect(isApiError(new Error("x"))).toBe(false);
  });

  it("null / undefined は false", () => {
    expect(isApiError(null)).toBe(false);
    expect(isApiError(undefined)).toBe(false);
  });
});
