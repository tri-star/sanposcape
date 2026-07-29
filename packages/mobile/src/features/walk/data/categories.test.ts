import { describe, expect, it } from "vitest";

import { ExploreCategory } from "@/api/generated/model";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  DEFAULT_CATEGORIES,
  DEFAULT_DURATION_MIN,
} from "@/features/walk/data/categories";

describe("CATEGORY_ORDER / CATEGORY_META", () => {
  it("CATEGORY_ORDER と CATEGORY_META のキー集合が過不足なく一致する", () => {
    const metaKeys = Object.keys(CATEGORY_META).sort();
    const orderKeys = [...CATEGORY_ORDER].sort();
    expect(orderKeys).toEqual(metaKeys);
  });

  it("CATEGORY_ORDER の要素が生成物 ExploreCategory の値集合と過不足なく一致する", () => {
    const generatedValues = Object.values(ExploreCategory).sort();
    const orderKeys = [...CATEGORY_ORDER].sort();
    expect(orderKeys).toEqual(generatedValues);
  });

  it("CATEGORY_ORDER の件数は API の maxItems(6) 以下", () => {
    expect(CATEGORY_ORDER.length).toBeLessThanOrEqual(6);
  });

  it("label はすべて非空", () => {
    for (const category of CATEGORY_ORDER) {
      expect(CATEGORY_META[category].label.length).toBeGreaterThan(0);
    }
  });
});

describe("DEFAULT_CATEGORIES", () => {
  it("既定は全カテゴリ", () => {
    expect([...DEFAULT_CATEGORIES].sort()).toEqual([...CATEGORY_ORDER].sort());
  });
});

describe("DEFAULT_DURATION_MIN", () => {
  it("10..120 の範囲で 5 の倍数", () => {
    expect(DEFAULT_DURATION_MIN).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_DURATION_MIN).toBeLessThanOrEqual(120);
    expect(DEFAULT_DURATION_MIN % 5).toBe(0);
  });
});
