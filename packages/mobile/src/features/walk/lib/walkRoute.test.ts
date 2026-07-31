import { describe, expect, it } from "vitest";

import type { WalkingRouteResponse } from "@/api/generated/model";
import {
  estimateRoundTripMinutes,
  toKilometers,
  toOneWayMinutes,
  toWalkRoute,
} from "@/features/walk/lib/walkRoute";

const RESPONSE: WalkingRouteResponse = {
  origin: { latitude: 35.6812, longitude: 139.7671 },
  destination: {
    place_id: "ChIJxxx",
    location: { latitude: 35.6875, longitude: 139.7625 },
    name: "緑町公園",
  },
  duration_seconds: 1200,
  distance_meters: 1600,
  path: [
    { latitude: 35.6812, longitude: 139.7671 },
    { latitude: 35.6875, longitude: 139.7625 },
  ],
  bounds: {
    north_east: { latitude: 35.6875, longitude: 139.7671 },
    south_west: { latitude: 35.6812, longitude: 139.7625 },
  },
};

describe("toWalkRoute", () => {
  it("snake_case を camelCase に写像する", () => {
    const result = toWalkRoute(RESPONSE);
    expect(result).toEqual({
      origin: { latitude: 35.6812, longitude: 139.7671 },
      destination: {
        placeId: "ChIJxxx",
        name: "緑町公園",
        location: { latitude: 35.6875, longitude: 139.7625 },
      },
      durationSeconds: 1200,
      distanceMeters: 1600,
      path: [
        { latitude: 35.6812, longitude: 139.7671 },
        { latitude: 35.6875, longitude: 139.7625 },
      ],
      bounds: {
        northEast: { latitude: 35.6875, longitude: 139.7671 },
        southWest: { latitude: 35.6812, longitude: 139.7625 },
      },
    });
  });

  it("bounds の north_east/south_west が northEast/southWest に写る", () => {
    const result = toWalkRoute(RESPONSE);
    expect(result.bounds.northEast).toEqual(RESPONSE.bounds.north_east);
    expect(result.bounds.southWest).toEqual(RESPONSE.bounds.south_west);
  });

  it("fallbackName が destination.name を上書きする", () => {
    const result = toWalkRoute(RESPONSE, "選択したスポット名");
    expect(result.destination.name).toBe("選択したスポット名");
  });

  it("fallbackName が無ければレスポンスの name を使う", () => {
    const result = toWalkRoute(RESPONSE);
    expect(result.destination.name).toBe("緑町公園");
  });

  it("負値・NaN のduration/distanceは0に丸まる", () => {
    const result = toWalkRoute({ ...RESPONSE, duration_seconds: -10, distance_meters: NaN });
    expect(result.durationSeconds).toBe(0);
    expect(result.distanceMeters).toBe(0);
  });

  it("origin が NaN なら throw する（代替が立てられないため取得失敗として扱う）", () => {
    expect(() =>
      toWalkRoute({
        ...RESPONSE,
        origin: { latitude: Number.NaN, longitude: 139.7671 },
      }),
    ).toThrow();
  });

  it("origin が緯度範囲外（91度）なら throw する", () => {
    expect(() =>
      toWalkRoute({
        ...RESPONSE,
        origin: { latitude: 91, longitude: 139.7671 },
      }),
    ).toThrow();
  });

  it("destination.location が Infinity なら throw する", () => {
    expect(() =>
      toWalkRoute({
        ...RESPONSE,
        destination: {
          ...RESPONSE.destination,
          location: { latitude: 35.6875, longitude: Number.POSITIVE_INFINITY },
        },
      }),
    ).toThrow();
  });

  it("destination.location が経度範囲外（181度）なら throw する", () => {
    expect(() =>
      toWalkRoute({
        ...RESPONSE,
        destination: {
          ...RESPONSE.destination,
          location: { latitude: 35.6875, longitude: 181 },
        },
      }),
    ).toThrow();
  });

  it("path の異常点だけを除外する（正常点は維持する）", () => {
    const result = toWalkRoute({
      ...RESPONSE,
      path: [
        { latitude: 35.6812, longitude: 139.7671 },
        { latitude: Number.NaN, longitude: 139.77 },
        { latitude: 35.6875, longitude: 139.7625 },
      ],
    });
    expect(result.path).toEqual([
      { latitude: 35.6812, longitude: 139.7671 },
      { latitude: 35.6875, longitude: 139.7625 },
    ]);
  });

  it("除外の結果 path が2点未満になったら空配列にする（ルート線なし扱い）", () => {
    const result = toWalkRoute({
      ...RESPONSE,
      path: [
        { latitude: 35.6812, longitude: 139.7671 },
        { latitude: Number.NaN, longitude: 139.77 },
      ],
    });
    expect(result.path).toEqual([]);
  });

  it("path が空でも duration/distance/destination は変わらず返る", () => {
    const result = toWalkRoute({
      ...RESPONSE,
      path: [{ latitude: Number.NaN, longitude: Number.NaN }],
    });
    expect(result.path).toEqual([]);
    expect(result.durationSeconds).toBe(1200);
    expect(result.distanceMeters).toBe(1600);
    expect(result.destination.name).toBe("緑町公園");
  });

  it("bounds が不正なら、検証済みの座標群から矩形を計算し直す", () => {
    const result = toWalkRoute({
      ...RESPONSE,
      bounds: {
        north_east: { latitude: Number.NaN, longitude: 139.7671 },
        south_west: { latitude: 35.6812, longitude: 139.7625 },
      },
    });
    // origin(35.6812,139.7671) / destination(35.6875,139.7625) / path の2点から再計算される。
    expect(result.bounds.northEast.latitude).toBe(35.6875);
    expect(result.bounds.northEast.longitude).toBe(139.7671);
    expect(result.bounds.southWest.latitude).toBe(35.6812);
    expect(result.bounds.southWest.longitude).toBe(139.7625);
    expect(Number.isFinite(result.bounds.northEast.latitude)).toBe(true);
    expect(Number.isFinite(result.bounds.southWest.longitude)).toBe(true);
  });

  it("bounds の south_west が範囲外（経度-181度）でも矩形を計算し直す", () => {
    const result = toWalkRoute({
      ...RESPONSE,
      bounds: {
        north_east: { latitude: 35.6875, longitude: 139.7671 },
        south_west: { latitude: 35.6812, longitude: -181 },
      },
    });
    expect(Number.isFinite(result.bounds.southWest.longitude)).toBe(true);
  });
});

describe("toOneWayMinutes", () => {
  it("1200秒 → 20分", () => {
    expect(toOneWayMinutes(1200)).toBe(20);
  });
});

describe("estimateRoundTripMinutes", () => {
  it("1200秒(片道) → 往復40分（片道×2）", () => {
    expect(estimateRoundTripMinutes(1200)).toBe(40);
  });
});

describe("toKilometers", () => {
  it("1600m → 1.6km", () => {
    expect(toKilometers(1600)).toBe(1.6);
  });

  it("負値・NaNは0に丸まる", () => {
    expect(toKilometers(-100)).toBe(0);
    expect(toKilometers(NaN)).toBe(0);
  });
});
