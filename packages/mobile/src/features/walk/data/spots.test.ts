import { describe, expect, it } from "vitest";

import { CATEGORY_META, CATEGORY_ORDER, SPOTS } from "@/features/walk/data/spots";

describe("SPOTS", () => {
  it("非空である", () => {
    expect(SPOTS.length).toBeGreaterThan(0);
  });

  it("id が一意である", () => {
    const ids = SPOTS.map((spot) => spot.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("category はすべて CATEGORY_META に登録済み", () => {
    for (const spot of SPOTS) {
      expect(Object.keys(CATEGORY_META)).toContain(spot.category);
    }
  });

  it("time/dist は正の値", () => {
    for (const spot of SPOTS) {
      expect(spot.time).toBeGreaterThan(0);
      expect(spot.dist).toBeGreaterThan(0);
    }
  });

  it("x/y は 0..100 の範囲（地図プレースホルダ上の相対位置）", () => {
    for (const spot of SPOTS) {
      expect(spot.x).toBeGreaterThanOrEqual(0);
      expect(spot.x).toBeLessThanOrEqual(100);
      expect(spot.y).toBeGreaterThanOrEqual(0);
      expect(spot.y).toBeLessThanOrEqual(100);
    }
  });
});

describe("CATEGORY_ORDER", () => {
  it("CATEGORY_META のキー集合と過不足なく一致する", () => {
    const metaKeys = Object.keys(CATEGORY_META).sort();
    const orderKeys = [...CATEGORY_ORDER].sort();
    expect(orderKeys).toEqual(metaKeys);
  });
});
