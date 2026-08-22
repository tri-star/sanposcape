import { describe, expect, it } from "vitest";

import {
  DESTINATION_NEAR_RADIUS_METERS,
  distanceToRoutePath,
  isOffRoute,
  ROUTE_DEVIATION_THRESHOLD_METERS,
} from "@/features/walk/lib/routeDeviation";
import type { WalkRoute } from "@/features/walk/types";
import type { GeoCoordinates } from "@/services/location/types";

const METERS_PER_DEGREE = 111_320;

// 東京駅付近を東西に走る直線の折れ線（約904m）。
const A: GeoCoordinates = { latitude: 35.681236, longitude: 139.767125 };
const B: GeoCoordinates = { latitude: 35.681236, longitude: 139.777125 };
const PATH: GeoCoordinates[] = [A, B];
const MID: GeoCoordinates = { latitude: 35.681236, longitude: 139.772125 };

// 折れ線から遠く離れた目的地（isOffRoute の目的地近接テスト用）。
const FAR_DESTINATION: GeoCoordinates = { latitude: 35.685, longitude: 139.767125 };

function northOffset(point: GeoCoordinates, meters: number): GeoCoordinates {
  return { latitude: point.latitude + meters / METERS_PER_DEGREE, longitude: point.longitude };
}

const ROUTE: WalkRoute = {
  origin: A,
  destination: { placeId: "dest-1", name: "目的地", location: B },
  durationSeconds: 600,
  distanceMeters: 900,
  path: PATH,
  legs: [],
  returnIsSamePath: false,
  bounds: { northEast: B, southWest: A },
};

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

describe("isOffRoute", () => {
  it("折れ線から30mの位置 → false（しきい値80m未満）", () => {
    const position = northOffset(MID, 30);
    expect(isOffRoute(position, ROUTE)).toBe(false);
  });

  it("折れ線から150mの位置 → true", () => {
    const position = northOffset(MID, 150);
    expect(isOffRoute(position, ROUTE)).toBe(true);
  });

  it("path.length < 2 のルート → 常に false", () => {
    const shortRoute: WalkRoute = { ...ROUTE, path: [A] };
    const farPosition = northOffset(MID, 500);
    expect(isOffRoute(farPosition, shortRoute)).toBe(false);
  });

  it("目的地から30m（DESTINATION_NEAR_RADIUS_METERS内）なら、折れ線から離れていても false", () => {
    const routeWithFarDestination: WalkRoute = {
      ...ROUTE,
      destination: { ...ROUTE.destination, location: FAR_DESTINATION },
    };
    const nearDestinationPosition = northOffset(FAR_DESTINATION, -30);

    // 前提: 目的地は折れ線から十分離れている（しきい値超えを確認する）。
    expect(distanceToRoutePath(FAR_DESTINATION, PATH)! > ROUTE_DEVIATION_THRESHOLD_METERS).toBe(
      true,
    );
    expect(DESTINATION_NEAR_RADIUS_METERS).toBe(50);

    expect(isOffRoute(nearDestinationPosition, routeWithFarDestination)).toBe(false);
  });
});
