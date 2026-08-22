import { describe, expect, it } from "vitest";

import type { WalkingRouteResponse } from "@/api/generated/model";
import { toRouteMinutes, toWalkRoute, walkRouteFitKey } from "@/features/walk/lib/walkRoute";
import type { WalkRoute } from "@/features/walk/types";

// 周回レスポンス（往路+復路の2 leg）。path は往路→復路の連結（接合点は重複させない）。
const RESPONSE: WalkingRouteResponse = {
  origin: { latitude: 35.6812, longitude: 139.7671 },
  destination: {
    place_id: "ChIJxxx",
    location: { latitude: 35.6875, longitude: 139.7625 },
    name: "緑町公園",
  },
  route_type: "loop",
  duration_seconds: 1200,
  distance_meters: 1600,
  path: [
    { latitude: 35.6812, longitude: 139.7671 },
    { latitude: 35.68435, longitude: 139.7648 },
    { latitude: 35.6875, longitude: 139.7625 },
  ],
  bounds: {
    north_east: { latitude: 35.6875, longitude: 139.7671 },
    south_west: { latitude: 35.6812, longitude: 139.7625 },
  },
  legs: [
    {
      kind: "outbound",
      duration_seconds: 600,
      distance_meters: 800,
      path: [
        { latitude: 35.6812, longitude: 139.7671 },
        { latitude: 35.6875, longitude: 139.7625 },
      ],
    },
    {
      kind: "return",
      duration_seconds: 600,
      distance_meters: 800,
      path: [
        { latitude: 35.6875, longitude: 139.7625 },
        { latitude: 35.684, longitude: 139.769 },
        { latitude: 35.6812, longitude: 139.7671 },
      ],
    },
  ],
  return_is_same_path: false,
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
      path: RESPONSE.path,
      legs: [
        {
          kind: "outbound",
          durationSeconds: 600,
          distanceMeters: 800,
          path: RESPONSE.legs[0]!.path,
        },
        {
          kind: "return",
          durationSeconds: 600,
          distanceMeters: 800,
          path: RESPONSE.legs[1]!.path,
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
    // origin(35.6812,139.7671) / destination(35.6875,139.7625) / path の点から再計算される。
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

  it("legs が WalkRouteLeg[] に写る（kind/秒/m/path）", () => {
    const result = toWalkRoute(RESPONSE);
    expect(result.legs).toHaveLength(2);
    expect(result.legs[0]).toEqual({
      kind: "outbound",
      durationSeconds: 600,
      distanceMeters: 800,
      path: RESPONSE.legs[0]!.path,
    });
    expect(result.legs[1]!.kind).toBe("return");
  });

  it("legs の1件の path に不正点が混ざる場合、その点だけ除外される", () => {
    const result = toWalkRoute({
      ...RESPONSE,
      legs: [
        {
          ...RESPONSE.legs[0]!,
          path: [
            { latitude: 35.6812, longitude: 139.7671 },
            { latitude: Number.NaN, longitude: 139.77 },
            { latitude: 35.6875, longitude: 139.7625 },
          ],
        },
        RESPONSE.legs[1]!,
      ],
    });
    expect(result.legs[0]!.path).toEqual([
      { latitude: 35.6812, longitude: 139.7671 },
      { latitude: 35.6875, longitude: 139.7625 },
    ]);
  });

  it("legs の1件が検証後2点未満なら、その leg が配列から落ちる（起きない前提の最終防衛）", () => {
    const result = toWalkRoute({
      ...RESPONSE,
      legs: [
        {
          ...RESPONSE.legs[0]!,
          path: [{ latitude: 35.6812, longitude: 139.7671 }],
        },
        RESPONSE.legs[1]!,
      ],
    });
    expect(result.legs).toHaveLength(1);
    expect(result.legs[0]!.kind).toBe("return");
  });

  it("legs が欠落（undefined）でも throw しない", () => {
    const { legs: _legs, ...withoutLegs } = RESPONSE;
    const result = toWalkRoute(withoutLegs as WalkingRouteResponse);
    expect(result.legs).toEqual([]);
  });

  it("legs が空配列なら legs: [] のまま", () => {
    const result = toWalkRoute({ ...RESPONSE, legs: [] });
    expect(result.legs).toEqual([]);
  });

  it("legs の duration_seconds / distance_meters が負値・NaN なら0に丸まる", () => {
    const result = toWalkRoute({
      ...RESPONSE,
      legs: [
        { ...RESPONSE.legs[0]!, duration_seconds: -5, distance_meters: Number.NaN },
        RESPONSE.legs[1]!,
      ],
    });
    expect(result.legs[0]!.durationSeconds).toBe(0);
    expect(result.legs[0]!.distanceMeters).toBe(0);
  });

  it("return_is_same_path: true が returnIsSamePath: true に写る", () => {
    const result = toWalkRoute({ ...RESPONSE, return_is_same_path: true });
    expect(result.returnIsSamePath).toBe(true);
  });

  it("return_is_same_path が欠落していれば returnIsSamePath: false になる", () => {
    const { return_is_same_path: _flag, ...withoutFlag } = RESPONSE;
    const result = toWalkRoute(withoutFlag as WalkingRouteResponse);
    expect(result.returnIsSamePath).toBe(false);
  });

  it("destination.place_id が null（復路の片道レスポンス）なら placeId: '' になり throw しない", () => {
    const result = toWalkRoute({
      ...RESPONSE,
      destination: { ...RESPONSE.destination, place_id: null },
    });
    expect(result.destination.placeId).toBe("");
  });

  it("destination.name が空文字・fallbackName 省略なら name: '目的地' になる（空文字のまま持たない）", () => {
    const result = toWalkRoute({ ...RESPONSE, destination: { ...RESPONSE.destination, name: "" } });
    expect(result.destination.name).toBe("目的地");
  });

  it("destination.name が空文字・fallbackName: '出発地点' なら name: '出発地点' になる", () => {
    const result = toWalkRoute(
      { ...RESPONSE, destination: { ...RESPONSE.destination, name: "" } },
      "出発地点",
    );
    expect(result.destination.name).toBe("出発地点");
  });

  it("fallbackName が空白のみなら素通りせず、レスポンスの name を使う", () => {
    const result = toWalkRoute(RESPONSE, "  ");
    expect(result.destination.name).toBe("緑町公園");
  });

  it("fallbackName もレスポンスの name も空なら '目的地' になる", () => {
    const result = toWalkRoute(
      { ...RESPONSE, destination: { ...RESPONSE.destination, name: "" } },
      "  ",
    );
    expect(result.destination.name).toBe("目的地");
  });

  it("レスポンスに route_type が入っていても WalkRoute に routeType 相当のフィールドが生えない（意図的に無視）", () => {
    const result = toWalkRoute({ ...RESPONSE, route_type: "loop" });
    expect(result).not.toHaveProperty("routeType");
    expect(result).not.toHaveProperty("route_type");
  });
});

describe("toRouteMinutes", () => {
  it("1200秒 → 20分", () => {
    expect(toRouteMinutes(1200)).toBe(20);
  });

  it("負値 → 0分", () => {
    expect(toRouteMinutes(-1)).toBe(0);
  });

  it("NaN → 0分", () => {
    expect(toRouteMinutes(Number.NaN)).toBe(0);
  });
});

describe("walkRouteFitKey", () => {
  const BASE_ROUTE: WalkRoute = toWalkRoute(RESPONSE);

  it("null なら null", () => {
    expect(walkRouteFitKey(null)).toBeNull();
  });

  it("同じ目的地でも origin が違えば別のキーになる（再計算後に地図が再フィットする根拠）", () => {
    const recalculated: WalkRoute = {
      ...BASE_ROUTE,
      origin: { latitude: 35.69, longitude: 139.76 },
    };
    expect(walkRouteFitKey(BASE_ROUTE)).not.toBe(walkRouteFitKey(recalculated));
  });

  it("同じ origin / placeId でも目的地座標が違えば別のキーになる（復路の再計算で目的地が出発地に変わる）", () => {
    const returnToStart: WalkRoute = {
      ...BASE_ROUTE,
      destination: {
        ...BASE_ROUTE.destination,
        placeId: "",
        location: { latitude: 35.7, longitude: 139.75 },
      },
    };
    expect(walkRouteFitKey(BASE_ROUTE)).not.toBe(walkRouteFitKey(returnToStart));
  });

  it("同じ origin / placeId なら同じキー", () => {
    const same: WalkRoute = { ...BASE_ROUTE };
    expect(walkRouteFitKey(BASE_ROUTE)).toBe(walkRouteFitKey(same));
  });
});
