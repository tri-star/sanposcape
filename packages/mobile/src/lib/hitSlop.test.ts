import { describe, expect, it } from "vitest";

import { hitSlopFor, MIN_TOUCH_TARGET } from "@/lib/hitSlop";

describe("hitSlopFor", () => {
  it("不足分を補って 44px 以上のタップ領域になる", () => {
    for (const size of [22, 26, 32, 34, 36]) {
      expect(size + hitSlopFor(size) * 2).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    }
  });

  it("すでに 44px 以上なら 0 を返す", () => {
    expect(hitSlopFor(44)).toBe(0);
    expect(hitSlopFor(54)).toBe(0);
  });

  it("非数のときは 0 を返す", () => {
    expect(hitSlopFor(Number.NaN)).toBe(0);
  });
});
