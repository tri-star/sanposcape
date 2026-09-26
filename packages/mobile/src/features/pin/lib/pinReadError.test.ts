import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  type PinReadErrorCode,
  isRetriablePinReadError,
  pinReadErrorMessage,
  toPinReadErrorCode,
} from "@/features/pin/lib/pinReadError";

describe("toPinReadErrorCode", () => {
  it.each([
    [400, "invalid_cursor"],
    [401, "unauthorized"],
    [404, "not_found"],
    [422, "invalid_request"],
    [500, "server"],
    [503, "server"],
    [418, "unknown"],
  ] as const)("status %d は %s に分類される", (status, expected) => {
    expect(toPinReadErrorCode(new ApiError(status))).toBe(expected);
  });

  it("TypeError（通信失敗）は network", () => {
    expect(toPinReadErrorCode(new TypeError("Failed to fetch"))).toBe("network");
  });

  it("その他の Error は unknown", () => {
    expect(toPinReadErrorCode(new Error("boom"))).toBe("unknown");
  });
});

describe("pinReadErrorMessage", () => {
  const codes: PinReadErrorCode[] = [
    "unauthorized",
    "not_found",
    "invalid_cursor",
    "invalid_request",
    "network",
    "server",
    "unknown",
  ];

  it.each(codes)("%s に文言がある", (code) => {
    expect(pinReadErrorMessage(code).length).toBeGreaterThan(0);
  });
});

describe("isRetriablePinReadError", () => {
  it("network / server / unknown / invalid_cursor は再試行可能", () => {
    expect(isRetriablePinReadError("network")).toBe(true);
    expect(isRetriablePinReadError("server")).toBe(true);
    expect(isRetriablePinReadError("unknown")).toBe(true);
    expect(isRetriablePinReadError("invalid_cursor")).toBe(true);
  });

  it("unauthorized / not_found / invalid_request は再試行不可", () => {
    expect(isRetriablePinReadError("unauthorized")).toBe(false);
    expect(isRetriablePinReadError("not_found")).toBe(false);
    expect(isRetriablePinReadError("invalid_request")).toBe(false);
  });
});
