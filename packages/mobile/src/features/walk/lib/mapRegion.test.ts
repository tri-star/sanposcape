import { describe, expect, it } from "vitest";

import { radiusMetersForRoundTrip, regionForRoundTrip } from "@/features/walk/lib/mapRegion";

/** mapRegion.ts の内部下限（MIN_DELTA）と同じ値。公開APIではないため直値で持つ。 */
const MIN_DELTA = 0.004;

describe("radiusMetersForRoundTrip", () => {
  it("60分 → 半径 2400m", () => {
    expect(radiusMetersForRoundTrip(60)).toBe(2400);
  });
});

describe("regionForRoundTrip", () => {
  const center = { latitude: 35.681236, longitude: 139.767125 };

  it("latitude/longitude が中心と一致する", () => {
    const region = regionForRoundTrip(center, 60);
    expect(region.latitude).toBe(center.latitude);
    expect(region.longitude).toBe(center.longitude);
  });

  it("往復時間が大きいほど delta が単調増加する", () => {
    const short = regionForRoundTrip(center, 60);
    const long = regionForRoundTrip(center, 120);
    expect(long.latitudeDelta).toBeGreaterThan(short.latitudeDelta);
    expect(long.longitudeDelta).toBeGreaterThan(short.longitudeDelta);
  });

  it("緯度0と緯度60で longitudeDelta が変わる（60度で約2倍）", () => {
    const atEquator = regionForRoundTrip({ latitude: 0, longitude: 0 }, 60);
    const at60 = regionForRoundTrip({ latitude: 60, longitude: 0 }, 60);
    expect(at60.longitudeDelta / atEquator.longitudeDelta).toBeCloseTo(2, 1);
  });

  it("極端な緯度（89度）でも有限値になる", () => {
    const region = regionForRoundTrip({ latitude: 89, longitude: 0 }, 60);
    expect(Number.isFinite(region.latitudeDelta)).toBe(true);
    expect(Number.isFinite(region.longitudeDelta)).toBe(true);
  });

  it("delta は最小値を下回らない（往復時間が非常に短くても）", () => {
    const region = regionForRoundTrip(center, 10);
    expect(region.latitudeDelta).toBeGreaterThanOrEqual(MIN_DELTA);
    expect(region.longitudeDelta).toBeGreaterThanOrEqual(MIN_DELTA);
  });
});
