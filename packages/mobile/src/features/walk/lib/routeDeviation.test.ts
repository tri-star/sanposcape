import { describe, expect, it } from "vitest";

import { distanceToRoutePath } from "@/features/walk/lib/routeDeviation";
import type { GeoCoordinates } from "@/services/location/types";

const METERS_PER_DEGREE = 111_320;

// 東京駅付近を東西に走る直線の折れ線（約904m）。
const A: GeoCoordinates = { latitude: 35.681236, longitude: 139.767125 };
const B: GeoCoordinates = { latitude: 35.681236, longitude: 139.777125 };
const PATH: GeoCoordinates[] = [A, B];
const MID: GeoCoordinates = { latitude: 35.681236, longitude: 139.772125 };

function northOffset(point: GeoCoordinates, meters: number): GeoCoordinates {
  return { latitude: point.latitude + meters / METERS_PER_DEGREE, longitude: point.longitude };
}

describe("distanceToRoutePath", () => {
  it("折れ線の線分上の点で0に近い値を返す（頂点でなくても）", () => {
    expect(distanceToRoutePath(MID, PATH)).toBeCloseTo(0, 1);
  });

  it("線分から北へ100m（= 100/111320度）ずらした点で約100m（±2m）", () => {
    const shifted = northOffset(MID, 100);
    const distance = distanceToRoutePath(shifted, PATH);
    expect(distance).not.toBeNull();
    expect(Math.abs(distance! - 100)).toBeLessThanOrEqual(2);
  });

  it("線分の端点より外側の点は、端点までの距離になる（射影のtクランプ）", () => {
    // B のさらに東（線分の外側）にある点。
    const outside: GeoCoordinates = { latitude: 35.681236, longitude: 139.787125 };
    const distanceToEndpoint = distanceToRoutePath(outside, [B]);
    const distanceToPath = distanceToRoutePath(outside, PATH);
    expect(distanceToEndpoint).not.toBeNull();
    expect(distanceToPath).toBeCloseTo(distanceToEndpoint!, 5);
  });

  it("path が空 → null", () => {
    expect(distanceToRoutePath(MID, [])).toBeNull();
  });

  it("1点 → その点との距離", () => {
    const point = northOffset(A, 50);
    expect(distanceToRoutePath(A, [point])).toBeCloseTo(50, 1);
  });

  it("同一座標が2つ並ぶ線分（長さ0）でも NaN にならない", () => {
    const distance = distanceToRoutePath(northOffset(A, 40), [A, A]);
    expect(distance).not.toBeNull();
    expect(Number.isNaN(distance)).toBe(false);
    expect(distance).toBeCloseTo(40, 1);
  });

  it("NaN / 範囲外の頂点は無視され、残りの頂点で計算される", () => {
    const invalidVertex: GeoCoordinates = { latitude: Number.NaN, longitude: 139.77 };
    const outOfRangeVertex: GeoCoordinates = { latitude: 91, longitude: 139.77 };
    const withInvalid = distanceToRoutePath(MID, [A, invalidVertex, outOfRangeVertex, B]);
    const withoutInvalid = distanceToRoutePath(MID, [A, B]);
    expect(withInvalid).toBeCloseTo(withoutInvalid!, 5);
  });
});
