import { describe, expect, it } from "vitest";

import { MIN_TOUCH_TARGET, resolveHitSlop } from "@/lib/resolveHitSlop";

describe("resolveHitSlop", () => {
  it("見た目のサイズが 44px 以上のときは 0", () => {
    expect(resolveHitSlop(44)).toBe(0);
    expect(resolveHitSlop(54)).toBe(0);
  });

  it("見た目のサイズが 44px 未満のとき、実タップ領域が 44px 以上になる片側マージンを返す", () => {
    for (const size of [16, 22, 28, 34, 40]) {
      const hitSlop = resolveHitSlop(size);
      expect(size + hitSlop * 2).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    }
  });

  it("34px(control-sm)は片側 5px", () => {
    expect(resolveHitSlop(34)).toBe(5);
  });

  it("負の値を返さない(サイズが極端に大きい場合)", () => {
    expect(resolveHitSlop(1000)).toBe(0);
  });
});
