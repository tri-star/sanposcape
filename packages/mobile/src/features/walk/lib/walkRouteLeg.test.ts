import { describe, expect, it } from "vitest";

import {
  findWalkRouteLeg,
  hasDistinctLegs,
  INITIAL_WALK_LEG_STATE,
  observeWalkLeg,
  type WalkLegState,
} from "@/features/walk/lib/walkRouteLeg";
import type { WalkRoute } from "@/features/walk/types";
import type { GeoCoordinates } from "@/services/location/types";

const METERS_PER_DEGREE = 111_320;

function northOffset(point: GeoCoordinates, meters: number): GeoCoordinates {
  return { latitude: point.latitude + meters / METERS_PER_DEGREE, longitude: point.longitude };
}

function eastOffset(point: GeoCoordinates, meters: number): GeoCoordinates {
  const cosLatitude = Math.cos((point.latitude * Math.PI) / 180);
  return {
    latitude: point.latitude,
    longitude: point.longitude + meters / (METERS_PER_DEGREE * cosLatitude),
  };
}

// 往路: O → D の直線（南北に1000m）。復路: 往路と平行に東へ100mずらした直線。
// 実際の周回の形とは異なるが、observeWalkLeg は leg.path の距離比較しか見ないため、
// 「別経路として離れた2本の折れ線」が作れれば十分。
const O: GeoCoordinates = { latitude: 35.6812, longitude: 139.7671 };
const D: GeoCoordinates = northOffset(O, 1000);
const OUTBOUND_PATH: GeoCoordinates[] = [O, D];
const RETURN_PATH: GeoCoordinates[] = [eastOffset(D, 100), eastOffset(O, 100)];

const ROUTE: WalkRoute = {
  origin: O,
  destination: { placeId: "dest-1", name: "目的地", location: D },
  durationSeconds: 1200,
  distanceMeters: 2000,
  path: [...OUTBOUND_PATH, ...RETURN_PATH],
  legs: [
    { kind: "outbound", durationSeconds: 600, distanceMeters: 1000, path: OUTBOUND_PATH },
    { kind: "return", durationSeconds: 600, distanceMeters: 1000, path: RETURN_PATH },
  ],
  returnIsSamePath: false,
  bounds: { northEast: D, southWest: O },
};

describe("findWalkRouteLeg", () => {
  it("該当 leg を返す", () => {
    expect(findWalkRouteLeg(ROUTE, "outbound")).toEqual(ROUTE.legs[0]);
  });

  it("legs が空なら null", () => {
    expect(findWalkRouteLeg({ ...ROUTE, legs: [] }, "return")).toBeNull();
  });

  it("route が null なら null", () => {
    expect(findWalkRouteLeg(null, "outbound")).toBeNull();
  });
});

describe("hasDistinctLegs", () => {
  it("legs 2件・returnIsSamePath: false なら true", () => {
    expect(hasDistinctLegs(ROUTE)).toBe(true);
  });

  it("legs 2件・returnIsSamePath: true（フォールバック）なら false", () => {
    expect(hasDistinctLegs({ ...ROUTE, returnIsSamePath: true })).toBe(false);
  });

  it("legs 1件なら false", () => {
    expect(hasDistinctLegs({ ...ROUTE, legs: [ROUTE.legs[0]!] })).toBe(false);
  });

  it("legs 0件なら false", () => {
    expect(hasDistinctLegs({ ...ROUTE, legs: [] })).toBe(false);
  });

  it("route が null なら false", () => {
    expect(hasDistinctLegs(null)).toBe(false);
  });
});

describe("observeWalkLeg", () => {
  it("初期状態 + 出発地付近の測位 → phase: outbound", () => {
    const result = observeWalkLeg(INITIAL_WALK_LEG_STATE, { position: O, route: ROUTE });
    expect(result.phase).toBe("outbound");
    expect(result.reachedDestination).toBe(false);
  });

  it("目的地から50m以内の測位 → phase: return / reachedDestination: true", () => {
    const nearDestination = northOffset(D, 10);
    const result = observeWalkLeg(INITIAL_WALK_LEG_STATE, {
      position: nearDestination,
      route: ROUTE,
    });
    expect(result.phase).toBe("return");
    expect(result.reachedDestination).toBe(true);
  });

  it("目的地到達後に離れた測位 → phase: return のまま（ラッチが効く）", () => {
    const reached: WalkLegState = { phase: "return", reachedDestination: true };
    const result = observeWalkLeg(reached, { position: O, route: ROUTE });
    expect(result.phase).toBe("return");
    expect(result.reachedDestination).toBe(true);
  });

  it("目的地到達後に往路の折れ線の真上に戻る測位 → phase: return のまま（単調性）", () => {
    const reached: WalkLegState = { phase: "return", reachedDestination: true };
    const onOutboundPath = northOffset(O, 500);
    const result = observeWalkLeg(reached, { position: onOutboundPath, route: ROUTE });
    expect(result.phase).toBe("return");
  });

  it("目的地未到達・復路の折れ線が往路より40m超近い測位 → phase: return", () => {
    const onReturnPath = eastOffset(northOffset(O, 500), 100);
    const result = observeWalkLeg(INITIAL_WALK_LEG_STATE, { position: onReturnPath, route: ROUTE });
    expect(result.phase).toBe("return");
    expect(result.reachedDestination).toBe(false);
  });

  it("目的地未到達・両 leg までの距離差が40m未満 → phase: outbound（ちらつかない）", () => {
    const betweenLegs = eastOffset(northOffset(O, 500), 50);
    const result = observeWalkLeg(INITIAL_WALK_LEG_STATE, { position: betweenLegs, route: ROUTE });
    expect(result.phase).toBe("outbound");
  });

  it("returnIsSamePath: true で復路側にいる測位 → phase: outbound（投影は使わない。目的地ラッチのみ）", () => {
    const fallbackRoute: WalkRoute = { ...ROUTE, returnIsSamePath: true };
    const onReturnPath = eastOffset(northOffset(O, 500), 100);
    const result = observeWalkLeg(INITIAL_WALK_LEG_STATE, {
      position: onReturnPath,
      route: fallbackRoute,
    });
    expect(result.phase).toBe("outbound");
  });

  it("route === null なら引数の state と同じ参照を返す", () => {
    const state: WalkLegState = { phase: "return", reachedDestination: true };
    const result = observeWalkLeg(state, { position: O, route: null });
    expect(result).toBe(state);
  });

  it("値が変わらない測位を連続で流すと同じ参照を返す（再レンダー抑止の根拠）", () => {
    const first = observeWalkLeg(INITIAL_WALK_LEG_STATE, { position: O, route: ROUTE });
    expect(first).toBe(INITIAL_WALK_LEG_STATE);
    const second = observeWalkLeg(first, { position: O, route: ROUTE });
    expect(second).toBe(first);
  });

  it("不正座標（NaN）の leg path しか無い場合 → phase: outbound（throw しない）", () => {
    const invalidRoute: WalkRoute = {
      ...ROUTE,
      legs: [
        {
          kind: "outbound",
          durationSeconds: 600,
          distanceMeters: 1000,
          path: [{ latitude: Number.NaN, longitude: Number.NaN }],
        },
        {
          kind: "return",
          durationSeconds: 600,
          distanceMeters: 1000,
          path: [{ latitude: Number.NaN, longitude: Number.NaN }],
        },
      ],
    };
    expect(() =>
      observeWalkLeg(INITIAL_WALK_LEG_STATE, { position: O, route: invalidRoute }),
    ).not.toThrow();
    const result = observeWalkLeg(INITIAL_WALK_LEG_STATE, { position: O, route: invalidRoute });
    expect(result.phase).toBe("outbound");
  });
});
