import { describe, expect, it } from "vitest";

import {
  radiusMetersForRoundTrip,
  regionForBounds,
  regionForRoundTrip,
} from "@/features/walk/lib/mapRegion";
import type { WalkRouteBounds } from "@/features/walk/types";

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

describe("regionForBounds", () => {
  const bounds: WalkRouteBounds = {
    northEast: { latitude: 35.6875, longitude: 139.7671 },
    southWest: { latitude: 35.6812, longitude: 139.7625 },
  };

  it("中心が bounds の中点になる", () => {
    const region = regionForBounds(bounds);
    expect(region.latitude).toBeCloseTo((35.6875 + 35.6812) / 2);
    expect(region.longitude).toBeCloseTo((139.7671 + 139.7625) / 2);
  });

  it("span が大きいほど delta が大きい", () => {
    const small = regionForBounds(bounds);
    const large = regionForBounds({
      northEast: { latitude: 35.72, longitude: 139.8 },
      southWest: { latitude: 35.6812, longitude: 139.7625 },
    });
    expect(large.latitudeDelta).toBeGreaterThan(small.latitudeDelta);
    expect(large.longitudeDelta).toBeGreaterThan(small.longitudeDelta);
  });

  it("1点に潰れた bounds でも MIN_DELTA を下回らない", () => {
    const point = { latitude: 35.6812, longitude: 139.7671 };
    const region = regionForBounds({ northEast: point, southWest: point });
    expect(region.latitudeDelta).toBe(MIN_DELTA);
    expect(region.longitudeDelta).toBe(MIN_DELTA);
  });

  it("bounds が反転していても正の delta になる", () => {
    const region = regionForBounds({
      northEast: { latitude: 35.6812, longitude: 139.7625 },
      southWest: { latitude: 35.6875, longitude: 139.7671 },
    });
    expect(region.latitudeDelta).toBeGreaterThan(0);
    expect(region.longitudeDelta).toBeGreaterThan(0);
  });
});
