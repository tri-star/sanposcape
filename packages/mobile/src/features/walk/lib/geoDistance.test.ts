import { describe, expect, it } from "vitest";

import { distanceMeters } from "@/features/walk/lib/geoDistance";

const TOKYO_STATION = { latitude: 35.681236, longitude: 139.767125 };
/** 東京駅からおおよそ 1km 北の地点（緯度1度 ≒ 111.32km なので約0.009度北）。 */
const ABOUT_1KM_NORTH = { latitude: 35.690222, longitude: 139.767125 };

describe("distanceMeters", () => {
  it("同一点は0m", () => {
    expect(distanceMeters(TOKYO_STATION, TOKYO_STATION)).toBe(0);
  });

  it("既知の2点（約1km）で誤差数%以内", () => {
    const result = distanceMeters(TOKYO_STATION, ABOUT_1KM_NORTH);
    expect(result).toBeGreaterThan(950);
    expect(result).toBeLessThan(1050);
  });

  it("非有限値が来たら0を返す", () => {
    expect(distanceMeters(TOKYO_STATION, { latitude: NaN, longitude: 139.7 })).toBe(0);
    expect(distanceMeters({ latitude: Infinity, longitude: 139.7 }, TOKYO_STATION)).toBe(0);
  });

  it("対称性: d(a,b) === d(b,a)", () => {
    expect(distanceMeters(TOKYO_STATION, ABOUT_1KM_NORTH)).toBe(
      distanceMeters(ABOUT_1KM_NORTH, TOKYO_STATION),
    );
  });
});
