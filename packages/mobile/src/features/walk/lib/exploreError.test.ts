import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  type ExploreErrorCode,
  exploreErrorMessage,
  isRetriableExploreError,
  toExploreErrorCode,
} from "@/features/walk/lib/exploreError";

describe("toExploreErrorCode", () => {
  it("ApiError 401 は unauthorized になる", () => {
    expect(toExploreErrorCode(new ApiError(401))).toBe("unauthorized");
  });

  it("ApiError 413 は too_large になる", () => {
    expect(toExploreErrorCode(new ApiError(413))).toBe("too_large");
  });

  it("ApiError 422 は invalid_request になる", () => {
    expect(toExploreErrorCode(new ApiError(422))).toBe("invalid_request");
  });

  it("ApiError 429 は rate_limited になる", () => {
    expect(toExploreErrorCode(new ApiError(429))).toBe("rate_limited");
  });

  it("ApiError 503 は provider_unavailable になる", () => {
    expect(toExploreErrorCode(new ApiError(503))).toBe("provider_unavailable");
  });

  it("その他の ApiError は unknown になる", () => {
    expect(toExploreErrorCode(new ApiError(500))).toBe("unknown");
  });

  it("TypeError（fetch の通信失敗）は network になる", () => {
    expect(toExploreErrorCode(new TypeError("Failed to fetch"))).toBe("network");
  });

  it("素の Error / null は unknown になる", () => {
    expect(toExploreErrorCode(new Error("boom"))).toBe("unknown");
    expect(toExploreErrorCode(null)).toBe("unknown");
  });
});

describe("exploreErrorMessage", () => {
  const codes: ExploreErrorCode[] = [
    "unauthorized",
    "too_large",
    "invalid_request",
    "rate_limited",
    "provider_unavailable",
    "network",
    "unknown",
  ];

  it.each(codes)("%s は非空文字列を返す", (code) => {
    expect(exploreErrorMessage(code).length).toBeGreaterThan(0);
  });
});

describe("isRetriableExploreError", () => {
  it.each(["rate_limited", "provider_unavailable", "network", "unknown"] as const)(
    "%s は再試行可能",
    (code) => {
      expect(isRetriableExploreError(code)).toBe(true);
    },
  );

  it.each(["unauthorized", "invalid_request", "too_large"] as const)("%s は再試行不可", (code) => {
    expect(isRetriableExploreError(code)).toBe(false);
  });
});
