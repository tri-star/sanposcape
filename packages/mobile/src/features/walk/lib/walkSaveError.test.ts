import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  type WalkSaveErrorCode,
  isRetriableWalkSaveError,
  toWalkSaveErrorCode,
  walkSaveErrorAction,
  walkSaveErrorMessage,
} from "@/features/walk/lib/walkSaveError";

describe("toWalkSaveErrorCode", () => {
  it("ApiError 401 は unauthorized になる", () => {
    expect(toWalkSaveErrorCode(new ApiError(401))).toBe("unauthorized");
  });

  it("ApiError 413 は too_large になる", () => {
    expect(toWalkSaveErrorCode(new ApiError(413))).toBe("too_large");
  });

  it("ApiError 422 は invalid_request になる", () => {
    expect(toWalkSaveErrorCode(new ApiError(422))).toBe("invalid_request");
  });

  it("ApiError 500 / 503 は server になる", () => {
    expect(toWalkSaveErrorCode(new ApiError(500))).toBe("server");
    expect(toWalkSaveErrorCode(new ApiError(503))).toBe("server");
  });

  it("それ以外の ApiError（例: 404）は unknown になる", () => {
    expect(toWalkSaveErrorCode(new ApiError(404))).toBe("unknown");
  });

  it("TypeError（fetch の通信失敗）は network になる", () => {
    expect(toWalkSaveErrorCode(new TypeError("Failed to fetch"))).toBe("network");
  });

  it("素の Error / null は unknown になる", () => {
    expect(toWalkSaveErrorCode(new Error("boom"))).toBe("unknown");
    expect(toWalkSaveErrorCode(null)).toBe("unknown");
  });
});

describe("walkSaveErrorMessage", () => {
  const codes: WalkSaveErrorCode[] = [
    "unauthorized",
    "too_large",
    "invalid_request",
    "network",
    "server",
    "unknown",
  ];

  it.each(codes)("%s は非空文字列を返す", (code) => {
    expect(walkSaveErrorMessage(code).length).toBeGreaterThan(0);
  });
});

describe("isRetriableWalkSaveError", () => {
  it.each(["network", "server", "unknown"] as const)("%s は再試行可能", (code) => {
    expect(isRetriableWalkSaveError(code)).toBe(true);
  });

  it.each(["unauthorized", "too_large", "invalid_request"] as const)("%s は再試行不可", (code) => {
    expect(isRetriableWalkSaveError(code)).toBe(false);
  });
});

describe("walkSaveErrorAction", () => {
  it("unauthorized は sign_in", () => {
    expect(walkSaveErrorAction("unauthorized")).toBe("sign_in");
  });

  it.each(["network", "server", "unknown"] as const)("%s は retry", (code) => {
    expect(walkSaveErrorAction(code)).toBe("retry");
  });

  it.each(["too_large", "invalid_request"] as const)("%s は none", (code) => {
    expect(walkSaveErrorAction(code)).toBe("none");
  });
});
