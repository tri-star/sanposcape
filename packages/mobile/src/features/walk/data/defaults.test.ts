import { describe, expect, it } from "vitest";

import { DEFAULT_WALK_GOAL, SAMPLE_WALK_RESULT } from "@/features/walk/data/defaults";
import { walkStatsFromElapsed } from "@/features/walk/lib/walkStats";

describe("DEFAULT_WALK_GOAL", () => {
  it("time/dist は正の値、name は非空文字列", () => {
    expect(DEFAULT_WALK_GOAL.time).toBeGreaterThan(0);
    expect(DEFAULT_WALK_GOAL.dist).toBeGreaterThan(0);
    expect(DEFAULT_WALK_GOAL.name.length).toBeGreaterThan(0);
  });
});

describe("SAMPLE_WALK_RESULT", () => {
  it("elapsedSec は正の値で、distKm/steps と見て矛盾しない範囲に収まる", () => {
    expect(SAMPLE_WALK_RESULT.elapsedSec).toBeGreaterThan(0);

    const stats = walkStatsFromElapsed(SAMPLE_WALK_RESULT.elapsedSec);
    const distKm = Number(SAMPLE_WALK_RESULT.distKm);

    expect(distKm).toBeGreaterThan(0);
    // 厳密一致は求めない（代表値としての見栄えを優先した静的スタブのため）が、
    // walkStatsFromElapsed の算出値から大きく乖離していないことは保証する。
    expect(Math.abs(stats.km - distKm)).toBeLessThan(1);
    expect(Math.abs(stats.steps - SAMPLE_WALK_RESULT.steps)).toBeLessThan(500);
  });

  it("steps は正の整数", () => {
    expect(Number.isInteger(SAMPLE_WALK_RESULT.steps)).toBe(true);
    expect(SAMPLE_WALK_RESULT.steps).toBeGreaterThan(0);
  });

  it("goalName は DEFAULT_WALK_GOAL.name と一致する", () => {
    expect(SAMPLE_WALK_RESULT.goalName).toBe(DEFAULT_WALK_GOAL.name);
  });
});
