import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  isRetriableWalkHistoryError,
  toWalkHistoryErrorCode,
  walkHistoryErrorMessage,
  type WalkHistoryErrorCode,
} from "@/features/history/lib/walkHistoryError";

describe("toWalkHistoryErrorCode", () => {
  it("401 → unauthorized", () => {
    expect(toWalkHistoryErrorCode(new ApiError(401))).toBe("unauthorized");
  });

  it("404 → not_found", () => {
    expect(toWalkHistoryErrorCode(new ApiError(404))).toBe("not_found");
  });

  it("400 → invalid_cursor", () => {
    expect(toWalkHistoryErrorCode(new ApiError(400))).toBe("invalid_cursor");
  });

  it("422 → invalid_request", () => {
    expect(toWalkHistoryErrorCode(new ApiError(422))).toBe("invalid_request");
  });

  it.each([500, 503])("%d → server", (status) => {
    expect(toWalkHistoryErrorCode(new ApiError(status))).toBe("server");
  });

  it("TypeError → network", () => {
    expect(toWalkHistoryErrorCode(new TypeError("failed to fetch"))).toBe("network");
  });

  it("未知の例外 → unknown", () => {
    expect(toWalkHistoryErrorCode(new Error("something else"))).toBe("unknown");
    expect(toWalkHistoryErrorCode(new ApiError(418))).toBe("unknown");
  });
});

describe("isRetriableWalkHistoryError", () => {
  it("再試行可能な真偽表", () => {
    const expected: Record<WalkHistoryErrorCode, boolean> = {
      unauthorized: false,
      not_found: false,
      invalid_cursor: true,
      invalid_request: false,
      network: true,
      server: true,
      unknown: true,
    };

    for (const [code, retriable] of Object.entries(expected) as [WalkHistoryErrorCode, boolean][]) {
      expect(isRetriableWalkHistoryError(code)).toBe(retriable);
    }
  });
});

describe("walkHistoryErrorMessage", () => {
  it("全コードにメッセージが存在する", () => {
    const codes: WalkHistoryErrorCode[] = [
      "unauthorized",
      "not_found",
      "invalid_cursor",
      "invalid_request",
      "network",
      "server",
      "unknown",
    ];

    for (const code of codes) {
      expect(walkHistoryErrorMessage(code).length).toBeGreaterThan(0);
    }
  });
});
