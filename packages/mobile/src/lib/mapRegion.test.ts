import { describe, expect, it } from "vitest";

import { MIN_REGION_DELTA, regionForCoordinates, sanitizeMapRegion } from "@/lib/mapRegion";
import type { GeoCoordinates } from "@/services/location/types";

describe("regionForCoordinates", () => {
  it("2点を包含する region の中心・delta を求める", () => {
    const region = regionForCoordinates([
      { latitude: 35.6812, longitude: 139.7625 },
      { latitude: 35.6875, longitude: 139.7671 },
    ]);

    expect(region).not.toBeNull();
    expect(region?.latitude).toBeCloseTo((35.6812 + 35.6875) / 2);
    expect(region?.longitude).toBeCloseTo((139.7625 + 139.7671) / 2);
    expect(region?.latitudeDelta).toBeCloseTo((35.6875 - 35.6812) * 1.35);
    expect(region?.longitudeDelta).toBeCloseTo((139.7671 - 139.7625) * 1.35);
  });

  it("1点だけなら MIN_REGION_DELTA になる", () => {
    const region = regionForCoordinates([{ latitude: 35.6812, longitude: 139.7625 }]);

    expect(region?.latitude).toBe(35.6812);
    expect(region?.longitude).toBe(139.7625);
    expect(region?.latitudeDelta).toBe(MIN_REGION_DELTA);
    expect(region?.longitudeDelta).toBe(MIN_REGION_DELTA);
  });

  it("空配列は null", () => {
    expect(regionForCoordinates([])).toBeNull();
  });

  it("無効座標のみなら null", () => {
    const region = regionForCoordinates([
      { latitude: Number.NaN, longitude: 139.7625 },
      { latitude: 91, longitude: 139.7625 },
    ]);
    expect(region).toBeNull();
  });

  it("無効座標が混ざっても有効点だけで計算する", () => {
    const region = regionForCoordinates([
      { latitude: Number.NaN, longitude: 139.7625 },
      { latitude: 35.6812, longitude: 139.7625 },
      { latitude: 35.6875, longitude: 139.7671 },
    ]);

    expect(region?.latitude).toBeCloseTo((35.6812 + 35.6875) / 2);
    expect(region?.longitude).toBeCloseTo((139.7625 + 139.7671) / 2);
  });

  it("10,000点でも有限値を返す（Math.max スプレッド回避の回帰テスト）", () => {
    const points: GeoCoordinates[] = Array.from({ length: 10_000 }, (_, i) => ({
      latitude: 35.6 + i * 0.00001,
      longitude: 139.7 + i * 0.00001,
    }));

    const region = regionForCoordinates(points);

    expect(region).not.toBeNull();
    expect(Number.isFinite(region?.latitude)).toBe(true);
    expect(Number.isFinite(region?.longitude)).toBe(true);
    expect(Number.isFinite(region?.latitudeDelta)).toBe(true);
    expect(Number.isFinite(region?.longitudeDelta)).toBe(true);
  });
});

describe("sanitizeMapRegion", () => {
  const VALID = {
    latitude: 35.6812,
    longitude: 139.7671,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  it("正常値はそのまま返す", () => {
    expect(sanitizeMapRegion(VALID)).toEqual(VALID);
  });

  it("null / undefined は null", () => {
    expect(sanitizeMapRegion(null)).toBeNull();
    expect(sanitizeMapRegion(undefined)).toBeNull();
  });

  it("NaN の緯度は null", () => {
    expect(sanitizeMapRegion({ ...VALID, latitude: Number.NaN })).toBeNull();
  });

  it("Infinity の delta は null", () => {
    expect(sanitizeMapRegion({ ...VALID, latitudeDelta: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it("範囲外の緯度（91）は null", () => {
    expect(sanitizeMapRegion({ ...VALID, latitude: 91 })).toBeNull();
  });

  it("delta が0は null", () => {
    expect(sanitizeMapRegion({ ...VALID, latitudeDelta: 0 })).toBeNull();
    expect(sanitizeMapRegion({ ...VALID, longitudeDelta: 0 })).toBeNull();
  });

  it("負の delta は null", () => {
    expect(sanitizeMapRegion({ ...VALID, latitudeDelta: -0.01 })).toBeNull();
  });
});
