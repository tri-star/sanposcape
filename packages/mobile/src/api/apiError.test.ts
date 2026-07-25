import { describe, expect, it } from "vitest";

import { ApiError, isApiError } from "@/api/apiError";

describe("ApiError", () => {
  it("既定メッセージは既存の client.ts と同じ形式になる", () => {
    expect(new ApiError(500).message).toBe("HTTP error! status: 500");
  });

  it("メッセージを明示指定できる", () => {
    expect(new ApiError(401, "unauthorized").message).toBe("unauthorized");
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
