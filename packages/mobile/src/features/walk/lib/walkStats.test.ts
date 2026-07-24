import { describe, expect, it } from "vitest";

import { estimateRoundTripKm, walkStatsFromElapsed } from "@/features/walk/lib/walkStats";

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

describe("walkStatsFromElapsed", () => {
  it("0秒は0km・0歩", () => {
    expect(walkStatsFromElapsed(0)).toEqual({ km: 0, steps: 0 });
  });

  it("既知値: 720秒 → 1.0km・1450歩", () => {
    expect(walkStatsFromElapsed(720)).toEqual({ km: 1, steps: 1450 });
  });

  it("端数を丸める", () => {
    const result = walkStatsFromElapsed(1714);
    expect(result.km).toBeCloseTo(2.4);
    expect(result.steps).toBe(3452);
  });
});
