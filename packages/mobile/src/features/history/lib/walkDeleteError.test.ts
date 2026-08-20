import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  type WalkDeleteErrorCode,
  canRetryWalkDelete,
  isRetriableWalkDeleteError,
  toWalkDeleteErrorCode,
  walkDeleteErrorMessage,
} from "@/features/history/lib/walkDeleteError";

describe("toWalkDeleteErrorCode", () => {
  it("ApiError 401 は unauthorized になる", () => {
    expect(toWalkDeleteErrorCode(new ApiError(401))).toBe("unauthorized");
  });

  it("ApiError 422 は invalid_request になる", () => {
    expect(toWalkDeleteErrorCode(new ApiError(422))).toBe("invalid_request");
  });

  it("ApiError 500 / 503 は server になる", () => {
    expect(toWalkDeleteErrorCode(new ApiError(500))).toBe("server");
    expect(toWalkDeleteErrorCode(new ApiError(503))).toBe("server");
  });

  it("それ以外の ApiError（例: 413）は unknown になる", () => {
    expect(toWalkDeleteErrorCode(new ApiError(413))).toBe("unknown");
  });

  it("TypeError（fetch の通信失敗）は network になる", () => {
    expect(toWalkDeleteErrorCode(new TypeError("Network request failed"))).toBe("network");
  });

  it("素の Error / null / undefined / 文字列は unknown になる", () => {
    expect(toWalkDeleteErrorCode(new Error("boom"))).toBe("unknown");
    expect(toWalkDeleteErrorCode(null)).toBe("unknown");
    expect(toWalkDeleteErrorCode(undefined)).toBe("unknown");
    expect(toWalkDeleteErrorCode("boom")).toBe("unknown");
  });
});

describe("walkDeleteErrorMessage", () => {
  const codes: WalkDeleteErrorCode[] = [
    "unauthorized",
    "invalid_request",
    "network",
    "server",
    "unknown",
  ];

  it.each(codes)("%s は非空文字列を返す", (code) => {
    expect(walkDeleteErrorMessage(code).length).toBeGreaterThan(0);
  });
});

describe("isRetriableWalkDeleteError", () => {
  it.each(["network", "server", "unknown"] as const)("%s は再試行可能", (code) => {
    expect(isRetriableWalkDeleteError(code)).toBe(true);
  });

  it.each(["unauthorized", "invalid_request"] as const)("%s は再試行不可", (code) => {
    expect(isRetriableWalkDeleteError(code)).toBe(false);
  });
});

describe("canRetryWalkDelete", () => {
  it("errorCode が null（未実行・実行中）なら削除ボタンを出す", () => {
    expect(canRetryWalkDelete(null)).toBe(true);
  });

  it.each(["network", "server", "unknown"] as const)(
    "%s（再試行可能な失敗）では削除ボタンを出す",
    (code) => {
      expect(canRetryWalkDelete(code)).toBe(true);
    },
  );

  it.each(["unauthorized", "invalid_request"] as const)(
    "%s（再試行しても無駄な失敗）では削除ボタンを出さない",
    (code) => {
      expect(canRetryWalkDelete(code)).toBe(false);
    },
  );
});
