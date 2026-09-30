import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import type { PinReadErrorCode } from "@/features/pin/lib/pinReadError";
import {
  sanpoMapCreateErrorMessage,
  sanpoMapReadErrorMessage,
  toSanpoMapCreateErrorCode,
  type SanpoMapCreateErrorCode,
} from "@/features/pin/lib/sanpoMapError";

describe("toSanpoMapCreateErrorCode", () => {
  it.each([
    [401, "unauthorized"],
    [422, "invalid_name"],
    [413, "unknown"],
    [500, "server"],
    [503, "server"],
    [400, "unknown"],
  ] as const)("ApiError(%i) は %s", (status, expected) => {
    expect(toSanpoMapCreateErrorCode(new ApiError(status))).toBe(expected);
  });

  it("TypeError は network", () => {
    expect(toSanpoMapCreateErrorCode(new TypeError("Network request failed"))).toBe("network");
  });

  it("その他は unknown", () => {
    expect(toSanpoMapCreateErrorCode(new Error("x"))).toBe("unknown");
    expect(toSanpoMapCreateErrorCode("x")).toBe("unknown");
  });
});

describe("messages", () => {
  const createCodes: SanpoMapCreateErrorCode[] = [
    "unauthorized",
    "invalid_name",
    "network",
    "server",
    "unknown",
  ];
  const readCodes: PinReadErrorCode[] = [
    "unauthorized",
    "not_found",
    "invalid_cursor",
    "invalid_request",
    "network",
    "server",
    "unknown",
  ];

  it("作成エラーの文言がすべて空でない", () => {
    for (const code of createCodes) {
      expect(sanpoMapCreateErrorMessage(code)).not.toBe("");
    }
  });

  it("読み込みエラーの文言が maps / pins × 全コードで空でない", () => {
    for (const target of ["maps", "pins"] as const) {
      for (const code of readCodes) {
        expect(sanpoMapReadErrorMessage(code, target)).not.toBe("");
      }
    }
  });

  it("pins × invalid_cursor は写真の話をしない", () => {
    expect(sanpoMapReadErrorMessage("invalid_cursor", "pins")).not.toContain("写真");
  });
});
