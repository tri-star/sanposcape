import { describe, expect, it } from "vitest";

import {
  DEFAULT_ACTIVE_WALK,
  DEFAULT_WALK_GOAL,
  SAMPLE_WALK_RESULT,
} from "@/features/walk/data/defaults";
import { estimateStepsFromMeters } from "@/features/walk/lib/walkStats";

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

    const distKm = Number(SAMPLE_WALK_RESULT.distKm);
    const steps = estimateStepsFromMeters(distKm * 1000);

    expect(distKm).toBeGreaterThan(0);
    // 厳密一致は求めない（代表値としての見栄えを優先した静的スタブのため）が、
    // estimateStepsFromMeters の算出値から大きく乖離していないことは保証する。
    expect(Math.abs(steps - SAMPLE_WALK_RESULT.steps)).toBeLessThan(500);
  });

  it("steps は正の整数", () => {
    expect(Number.isInteger(SAMPLE_WALK_RESULT.steps)).toBe(true);
    expect(SAMPLE_WALK_RESULT.steps).toBeGreaterThan(0);
  });

  it("goalName は DEFAULT_WALK_GOAL.name と一致する", () => {
    expect(SAMPLE_WALK_RESULT.goalName).toBe(DEFAULT_WALK_GOAL.name);
  });
});

describe("DEFAULT_ACTIVE_WALK", () => {
  it("origin と destination.location が異なる", () => {
    expect(DEFAULT_ACTIVE_WALK.origin).not.toEqual(DEFAULT_ACTIVE_WALK.destination.location);
  });

  it("緯度・経度が有効な範囲に収まる", () => {
    for (const point of [DEFAULT_ACTIVE_WALK.origin, DEFAULT_ACTIVE_WALK.destination.location]) {
      expect(point.latitude).toBeGreaterThanOrEqual(-90);
      expect(point.latitude).toBeLessThanOrEqual(90);
      expect(point.longitude).toBeGreaterThanOrEqual(-180);
      expect(point.longitude).toBeLessThanOrEqual(180);
    }
  });

  it("placeId が非空文字列", () => {
    expect(DEFAULT_ACTIVE_WALK.destination.placeId.length).toBeGreaterThan(0);
  });

  it("roundTripMinutes が正の値", () => {
    expect(DEFAULT_ACTIVE_WALK.roundTripMinutes).toBeGreaterThan(0);
  });
});
