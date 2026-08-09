import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  isRetriableWalkStatsError,
  toWalkStatsErrorCode,
  walkStatsErrorMessage,
  type WalkStatsErrorCode,
} from "@/features/history/lib/walkStatsError";

describe("toWalkStatsErrorCode", () => {
  it.each([
    [401, "unauthorized"],
    [422, "invalid_request"],
  ] as const)("%d → %s", (status, expected) => {
    expect(toWalkStatsErrorCode(new ApiError(status))).toBe(expected);
  });

  it.each([500, 503])("%d → server", (status) => {
    expect(toWalkStatsErrorCode(new ApiError(status))).toBe("server");
  });

  it("未知の status（418）→ unknown", () => {
    expect(toWalkStatsErrorCode(new ApiError(418))).toBe("unknown");
  });

  it("TypeError → network", () => {
    expect(toWalkStatsErrorCode(new TypeError("Network request failed"))).toBe("network");
  });

  it("文字列 → unknown", () => {
    expect(toWalkStatsErrorCode("文字列")).toBe("unknown");
  });

  it("undefined → unknown", () => {
    expect(toWalkStatsErrorCode(undefined)).toBe("unknown");
  });
});

describe("walkStatsErrorMessage", () => {
  it("全コードに対して非空文字列を返す", () => {
    const codes: WalkStatsErrorCode[] = [
      "unauthorized",
      "invalid_request",
      "network",
      "server",
      "unknown",
    ];

    for (const code of codes) {
      expect(walkStatsErrorMessage(code).length).toBeGreaterThan(0);
    }
  });
});

describe("isRetriableWalkStatsError", () => {
  it("再試行可能な真偽表", () => {
    const expected: Record<WalkStatsErrorCode, boolean> = {
      unauthorized: false,
      invalid_request: false,
      network: true,
      server: true,
      unknown: true,
    };

    for (const [code, retriable] of Object.entries(expected) as [WalkStatsErrorCode, boolean][]) {
      expect(isRetriableWalkStatsError(code)).toBe(retriable);
    }
  });
});
