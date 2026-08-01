import { describe, expect, it } from "vitest";

import { toNonNegative } from "@/features/walk/lib/numberGuard";

describe("toNonNegative", () => {
  it("正の有限値はそのまま返す", () => {
    expect(toNonNegative(42)).toBe(42);
  });

  it("0はそのまま返す", () => {
    expect(toNonNegative(0)).toBe(0);
  });

  it("負値は0にフォールバックする", () => {
    expect(toNonNegative(-1)).toBe(0);
  });

  it("NaNは0にフォールバックする", () => {
    expect(toNonNegative(Number.NaN)).toBe(0);
  });

  it("Infinityは0にフォールバックする", () => {
    expect(toNonNegative(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("-Infinityは0にフォールバックする", () => {
    expect(toNonNegative(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});
