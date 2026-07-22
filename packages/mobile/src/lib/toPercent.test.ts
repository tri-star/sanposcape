import { describe, expect, it } from "vitest";

import { toPercent } from "@/lib/toPercent";

describe("toPercent", () => {
  it("value / max を百分率にする", () => {
    expect(toPercent(50, 100)).toBe(50);
    expect(toPercent(6240, 8000)).toBeCloseTo(78);
  });

  it("0〜100 の範囲に丸める", () => {
    expect(toPercent(-10, 100)).toBe(0);
    expect(toPercent(150, 100)).toBe(100);
  });

  it("max が 0 以下・非数のときは 0 を返す", () => {
    expect(toPercent(10, 0)).toBe(0);
    expect(toPercent(10, -5)).toBe(0);
    expect(toPercent(Number.NaN, 100)).toBe(0);
  });
});
