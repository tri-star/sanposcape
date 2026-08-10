import { describe, expect, it } from "vitest";

import {
  ESTIMATED_STEPS_LABEL,
  ESTIMATED_STEPS_NOTE,
  ESTIMATED_STRIDE_METERS,
  estimateSteps,
} from "@/features/history/lib/stepEstimate";

describe("estimateSteps", () => {
  it("4368m → 6240歩（歩幅0.7m。旧スタブ TODAY_STEPS と同値）", () => {
    expect(estimateSteps(4368)).toBe(6240);
  });

  it("0m → 0歩", () => {
    expect(estimateSteps(0)).toBe(0);
  });

  it.each([-100, NaN, Infinity])("負値・非有限値（%s）→ 0歩", (value) => {
    expect(estimateSteps(value)).toBe(0);
  });

  it("0.7m → 1歩（ちょうど1歩分）", () => {
    expect(estimateSteps(0.7)).toBe(1);
  });

  it("1.04m → 1歩（四捨五入の切り捨て境界）", () => {
    expect(estimateSteps(1.04)).toBe(1);
  });

  it("1.05m → 2歩（四捨五入の繰り上げ境界）", () => {
    expect(estimateSteps(1.05)).toBe(2);
  });
});

describe("表示文言", () => {
  it("ESTIMATED_STEPS_LABEL に「推定」が含まれる", () => {
    expect(ESTIMATED_STEPS_LABEL).toContain("推定");
  });

  it("ESTIMATED_STEPS_NOTE に「推定」が含まれる", () => {
    expect(ESTIMATED_STEPS_NOTE).toContain("推定");
  });
});

describe("ESTIMATED_STRIDE_METERS", () => {
  it("0.7 である（定数の書き換え検知）", () => {
    expect(ESTIMATED_STRIDE_METERS).toBe(0.7);
  });
});
