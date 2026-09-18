import { describe, expect, it } from "vitest";

import type { LoopWalkingRouteResponse } from "@/api/generated/model";
import { toRouteMinutes, toWalkRoute, walkRouteFitKey } from "@/features/walk/lib/walkRoute";
import type { WalkRoute } from "@/features/walk/types";

const RESPONSE: LoopWalkingRouteResponse = {
  origin: { latitude: 35.6812, longitude: 139.7671 },
  destination: {
    place_id: "ChIJxxx",
    location: { latitude: 35.6875, longitude: 139.7625 },
    name: "緑町公園",
  },
  duration_seconds: 2760,
  distance_meters: 3680,
  legs: [
    {
      kind: "outbound",
      duration_seconds: 1200,
      distance_meters: 1600,
      path: [
        { latitude: 35.6812, longitude: 139.7671 },
        { latitude: 35.6875, longitude: 139.7625 },
      ],
    },
    {
      kind: "return",
      duration_seconds: 1560,
      distance_meters: 2080,
      path: [
        { latitude: 35.6875, longitude: 139.7625 },
        { latitude: 35.6812, longitude: 139.7671 },
      ],
    },
  ],
  return_is_same_path: false,
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
      durationSeconds: 2760,
      distanceMeters: 3680,
      legs: [
        {
          kind: "outbound",
          durationSeconds: 1200,
          distanceMeters: 1600,
          path: [
            { latitude: 35.6812, longitude: 139.7671 },
            { latitude: 35.6875, longitude: 139.7625 },
          ],
        },
        {
          kind: "return",
          durationSeconds: 1560,
          distanceMeters: 2080,
          path: [
            { latitude: 35.6875, longitude: 139.7625 },
            { latitude: 35.6812, longitude: 139.7671 },
          ],
        },
      ],
      returnIsSamePath: false,
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

  it("legs が [return, outbound] の逆順で来ても legs[0].kind === outbound に並べ替わる", () => {
    const result = toWalkRoute({
      ...RESPONSE,
      legs: [RESPONSE.legs[1]!, RESPONSE.legs[0]!],
    });
    expect(result.legs[0].kind).toBe("outbound");
    expect(result.legs[1].kind).toBe("return");
  });

  it("outbound が欠けていれば throw する", () => {
    expect(() =>
      toWalkRoute({
        ...RESPONSE,
        legs: [RESPONSE.legs[1]!, { ...RESPONSE.legs[1]!, duration_seconds: 100 }],
      }),
    ).toThrow();
  });

  it("return が欠けていれば throw する", () => {
    expect(() =>
      toWalkRoute({
        ...RESPONSE,
        legs: [RESPONSE.legs[0]!, { ...RESPONSE.legs[0]!, duration_seconds: 100 }],
      }),
    ).toThrow();
  });

  it("outbound が2本あれば throw する", () => {
    expect(() =>
      toWalkRoute({
        ...RESPONSE,
        legs: [RESPONSE.legs[0]!, RESPONSE.legs[0]!],
      }),
    ).toThrow();
  });

  it("return_is_same_path: true なら returnIsSamePath === true で legs はそのまま2本", () => {
    const result = toWalkRoute({ ...RESPONSE, return_is_same_path: true });
    expect(result.returnIsSamePath).toBe(true);
    expect(result.legs).toHaveLength(2);
  });

  it("周回合計はレスポンス値を使う（legs 合計と食い違っていても duration_seconds を採用）", () => {
    const result = toWalkRoute({ ...RESPONSE, duration_seconds: 9999 });
    expect(result.durationSeconds).toBe(9999);
  });

  it("leg の path が不正点除外で1点になると、その leg の path が空配列になる（他方の leg は維持）", () => {
    const result = toWalkRoute({
      ...RESPONSE,
      legs: [
        {
          ...RESPONSE.legs[0]!,
          path: [
            { latitude: 35.6812, longitude: 139.7671 },
            { latitude: Number.NaN, longitude: 139.77 },
          ],
        },
        RESPONSE.legs[1]!,
      ],
    });
    expect(result.legs[0].path).toEqual([]);
    expect(result.legs[1].path).toEqual(RESPONSE.legs[1]!.path);
  });

  it("path が空でも duration/distance/destination は変わらず返る", () => {
    const result = toWalkRoute({
      ...RESPONSE,
      legs: [
        { ...RESPONSE.legs[0]!, path: [{ latitude: Number.NaN, longitude: Number.NaN }] },
        RESPONSE.legs[1]!,
      ],
    });
    expect(result.legs[0].path).toEqual([]);
    expect(result.durationSeconds).toBe(2760);
    expect(result.distanceMeters).toBe(3680);
    expect(result.destination.name).toBe("緑町公園");
  });

  it("bounds が不正なら、両 leg の点を含めて矩形を計算し直す（復路にしかない点が矩形に含まれる）", () => {
    const result = toWalkRoute({
      ...RESPONSE,
      legs: [
        RESPONSE.legs[0]!,
        {
          ...RESPONSE.legs[1]!,
          path: [
            { latitude: 35.6875, longitude: 139.7625 },
            { latitude: 35.69, longitude: 139.78 }, // 復路にしかない点
            { latitude: 35.6812, longitude: 139.7671 },
          ],
        },
      ],
      bounds: {
        north_east: { latitude: Number.NaN, longitude: 139.7671 },
        south_west: { latitude: 35.6812, longitude: 139.7625 },
      },
    });
    expect(result.bounds.northEast.latitude).toBe(35.69);
    expect(result.bounds.northEast.longitude).toBe(139.78);
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

  it("leg の path 端点が origin/destination と数 m ずれていても throw せず、path はそのまま", () => {
    const snappedOutbound = {
      ...RESPONSE.legs[0]!,
      path: [
        { latitude: 35.68125, longitude: 139.76715 }, // origin から数mずれた道路吸着点
        { latitude: 35.68745, longitude: 139.76255 }, // destination から数mずれた道路吸着点
      ],
    };
    const result = toWalkRoute({ ...RESPONSE, legs: [snappedOutbound, RESPONSE.legs[1]!] });
    expect(result.legs[0].path).toEqual(snappedOutbound.path);
  });
});

describe("toRouteMinutes", () => {
  it("1500秒 → 25分", () => {
    expect(toRouteMinutes(1500)).toBe(25);
  });

  it("89秒 → 1分（四捨五入）", () => {
    expect(toRouteMinutes(89)).toBe(1);
  });

  it("負値・NaN は0分", () => {
    expect(toRouteMinutes(-10)).toBe(0);
    expect(toRouteMinutes(Number.NaN)).toBe(0);
  });
});

describe("walkRouteFitKey", () => {
  const BASE_ROUTE: WalkRoute = toWalkRoute(RESPONSE);

  it("null なら null", () => {
    expect(walkRouteFitKey(null)).toBeNull();
  });

  it("同じ目的地でも origin が違えば別のキーになる（現在地を取り直したときに地図が再フィットする根拠）", () => {
    const retaken: WalkRoute = {
      ...BASE_ROUTE,
      origin: { latitude: 35.69, longitude: 139.76 },
    };
    expect(walkRouteFitKey(BASE_ROUTE)).not.toBe(walkRouteFitKey(retaken));
  });

  it("同じ origin / placeId なら同じキー", () => {
    const same: WalkRoute = { ...BASE_ROUTE };
    expect(walkRouteFitKey(BASE_ROUTE)).toBe(walkRouteFitKey(same));
  });
});
