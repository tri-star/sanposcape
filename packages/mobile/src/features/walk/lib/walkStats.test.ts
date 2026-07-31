import { describe, expect, it } from "vitest";

import { estimateRoundTripKm, estimateStepsFromMeters } from "@/features/walk/lib/walkStats";

describe("estimateRoundTripKm", () => {
  it("0分は0km", () => {
    expect(estimateRoundTripKm(0)).toBe(0);
  });

  it("小数1桁に丸める", () => {
    expect(estimateRoundTripKm(60)).toBeCloseTo(4.0);
    expect(estimateRoundTripKm(20)).toBeCloseTo(1.3);
  });

  it("既知値: 100分 → 6.6km", () => {
    expect(estimateRoundTripKm(100)).toBeCloseTo(6.6);
  });
});

describe("estimateStepsFromMeters", () => {
  it("0mは0歩", () => {
    expect(estimateStepsFromMeters(0)).toBe(0);
  });

  it("1000m → 1450歩", () => {
    expect(estimateStepsFromMeters(1000)).toBe(1450);
  });

  it("負値・NaNは0歩", () => {
    expect(estimateStepsFromMeters(-100)).toBe(0);
    expect(estimateStepsFromMeters(NaN)).toBe(0);
  });
});
