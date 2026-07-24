import { describe, expect, it } from "vitest";

import { formatClock } from "@/lib/formatClock";

describe("formatClock", () => {
  it("0秒", () => {
    expect(formatClock(0)).toBe("00:00:00");
  });

  it("秒の繰り上がり", () => {
    expect(formatClock(65)).toBe("00:01:05");
  });

  it("時間の繰り上がり", () => {
    expect(formatClock(3661)).toBe("01:01:01");
  });

  it("既知値（散歩中の経過秒）", () => {
    expect(formatClock(1714)).toBe("00:28:34");
  });

  it("小数は切り捨てる", () => {
    expect(formatClock(59.9)).toBe("00:00:59");
  });

  it("負の値は例外", () => {
    expect(() => formatClock(-1)).toThrow();
  });

  it("非有限値は例外", () => {
    expect(() => formatClock(Number.NaN)).toThrow();
    expect(() => formatClock(Number.POSITIVE_INFINITY)).toThrow();
  });
});
