import { describe, expect, it } from "vitest";

import { DEFAULT_ACTIVE_WALK, DEFAULT_WALK_GOAL } from "@/features/walk/active/data/defaults";

describe("DEFAULT_WALK_GOAL", () => {
  it("time/dist は正の値、name は非空文字列", () => {
    expect(DEFAULT_WALK_GOAL.time).toBeGreaterThan(0);
    expect(DEFAULT_WALK_GOAL.dist).toBeGreaterThan(0);
    expect(DEFAULT_WALK_GOAL.name.length).toBeGreaterThan(0);
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

  it("loopMinutes が正の値", () => {
    expect(DEFAULT_ACTIVE_WALK.loopMinutes).toBeGreaterThan(0);
  });
});
