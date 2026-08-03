import { describe, expect, it } from "vitest";

import { MIN_REGION_DELTA, regionForCoordinates } from "@/lib/mapRegion";
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
