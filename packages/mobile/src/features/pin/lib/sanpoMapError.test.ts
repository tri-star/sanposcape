import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import type { PinReadErrorCode } from "@/features/pin/lib/pinReadError";
import {
  sanpoMapCreateErrorMessage,
  sanpoMapReadErrorMessage,
  sanpoMapUpdateErrorMessage,
  toSanpoMapCreateErrorCode,
  toSanpoMapUpdateErrorCode,
  type SanpoMapCreateErrorCode,
  type SanpoMapUpdateErrorCode,
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

describe("toSanpoMapUpdateErrorCode", () => {
  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not_found"],
    [422, "invalid_request"],
    [500, "server"],
    [503, "server"],
    [400, "unknown"],
  ] as const)("ApiError(%i) は %s", (status, expected) => {
    expect(toSanpoMapUpdateErrorCode(new ApiError(status))).toBe(expected);
  });

  it("TypeError は network、その他は unknown", () => {
    expect(toSanpoMapUpdateErrorCode(new TypeError("x"))).toBe("network");
    expect(toSanpoMapUpdateErrorCode(new Error("x"))).toBe("unknown");
  });

  it("全 code に空でない文言がある", () => {
    const codes: SanpoMapUpdateErrorCode[] = [
      "unauthorized",
      "forbidden",
      "not_found",
      "invalid_request",
      "network",
      "server",
      "unknown",
    ];
    for (const code of codes) {
      expect(sanpoMapUpdateErrorMessage(code)).not.toBe("");
    }
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
