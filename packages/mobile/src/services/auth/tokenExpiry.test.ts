import { describe, expect, it } from "vitest";

import {
  ACCESS_TOKEN_EXPIRY_SKEW_MS,
  isAccessTokenExpired,
  toExpiresAt,
} from "@/services/auth/tokenExpiry";

describe("isAccessTokenExpired", () => {
  const now = 1_000_000;

  it("token が null なら true", () => {
    expect(isAccessTokenExpired(null, now)).toBe(true);
  });

  it("十分先の expiresAt なら false", () => {
    expect(isAccessTokenExpired({ value: "t", expiresAt: now + 60_000 }, now)).toBe(false);
  });

  it("expiresAt がちょうど now + skew なら true（境界）", () => {
    expect(
      isAccessTokenExpired({ value: "t", expiresAt: now + ACCESS_TOKEN_EXPIRY_SKEW_MS }, now),
    ).toBe(true);
  });

  it("過去の expiresAt なら true", () => {
    expect(isAccessTokenExpired({ value: "t", expiresAt: now - 1 }, now)).toBe(true);
  });
});

describe("toExpiresAt", () => {
  it("秒とnowから失効時刻(epoch ms)を求める", () => {
    expect(toExpiresAt(3600, 1_000_000)).toBe(1_000_000 + 3_600_000);
  });
});
