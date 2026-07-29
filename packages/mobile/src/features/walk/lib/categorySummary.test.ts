import { describe, expect, it } from "vitest";

import { categorySummary } from "@/features/walk/lib/categorySummary";

const ALL: readonly ["convenience_store", "supermarket", "retail", "facility", "park", "station"] =
  ["convenience_store", "supermarket", "retail", "facility", "park", "station"];

describe("categorySummary", () => {
  it("全カテゴリ選択なら「すべて」", () => {
    expect(categorySummary(ALL, 6)).toBe("すべて");
  });

  it("0件なら「なし」", () => {
    expect(categorySummary([], 6)).toBe("なし");
  });

  it("中間の件数なら「N種類」", () => {
    expect(categorySummary(["park", "station"], 6)).toBe("2種類");
  });

  it("total 省略時は既定の6で判定する", () => {
    expect(categorySummary(ALL)).toBe("すべて");
  });
});
