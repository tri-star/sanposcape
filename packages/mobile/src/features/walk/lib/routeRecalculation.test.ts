import { describe, expect, it } from "vitest";

import {
  applyRecalculationFailure,
  applyRecalculationSuccess,
  beginRecalculation,
  INITIAL_ROUTE_RECALC_STATE,
  resetRecalculation,
  type RouteRecalcState,
} from "@/features/walk/lib/routeRecalculation";
import type { WalkRoute } from "@/features/walk/types";

const NEW_ROUTE: WalkRoute = {
  origin: { latitude: 35.7, longitude: 139.75 },
  destination: {
    placeId: "dest-1",
    name: "目的地",
    location: { latitude: 35.71, longitude: 139.76 },
  },
  durationSeconds: 500,
  distanceMeters: 700,
  path: [
    { latitude: 35.7, longitude: 139.75 },
    { latitude: 35.71, longitude: 139.76 },
  ],
  legs: [],
  returnIsSamePath: false,
  bounds: {
    northEast: { latitude: 35.71, longitude: 139.76 },
    southWest: { latitude: 35.7, longitude: 139.75 },
  },
};

describe("beginRecalculation / applyRecalculationSuccess", () => {
  it("applyRecalculationSuccess 後、status が idle / route が新ルート / errorCode が null", () => {
    const started = beginRecalculation(INITIAL_ROUTE_RECALC_STATE, { sequence: 1 });
    const succeeded = applyRecalculationSuccess(started, { sequence: 1, route: NEW_ROUTE });
    expect(succeeded.status).toBe("idle");
    expect(succeeded.route).toBe(NEW_ROUTE);
    expect(succeeded.errorCode).toBeNull();
  });

  it("beginRecalculation は route を保持したまま status を recalculating にする（AC3・#6）", () => {
    const withRoute: RouteRecalcState = { ...INITIAL_ROUTE_RECALC_STATE, route: NEW_ROUTE };
    const started = beginRecalculation(withRoute, { sequence: 1 });
    expect(started.status).toBe("recalculating");
    expect(started.route).toBe(NEW_ROUTE);
  });

  it("失敗の直後に再計算を始めると errorCode がクリアされる（手動再試行は必ず許可される）", () => {
    const started = beginRecalculation(INITIAL_ROUTE_RECALC_STATE, { sequence: 1 });
    const failed = applyRecalculationFailure(started, { sequence: 1, errorCode: "network" });
    const restarted = beginRecalculation(failed, { sequence: 2 });
    expect(restarted.status).toBe("recalculating");
    expect(restarted.errorCode).toBeNull();
  });
});

describe("applyRecalculationFailure", () => {
  it("失敗しても state.route（直前の成功ルート）が保持され、status が failed / errorCode が入る（AC3・#5）", () => {
    const withRoute: RouteRecalcState = { ...INITIAL_ROUTE_RECALC_STATE, route: NEW_ROUTE };
    const started = beginRecalculation(withRoute, { sequence: 1 });
    const failed = applyRecalculationFailure(started, { sequence: 1, errorCode: "network" });
    expect(failed.route).toBe(NEW_ROUTE);
    expect(failed.status).toBe("failed");
    expect(failed.errorCode).toBe("network");
  });
});

describe("多重起動の二重防御（AC4）", () => {
  it("applyRecalculationSuccess に古い sequence を渡すと state が変化しない（同一参照が返る・#8）", () => {
    const started = beginRecalculation(INITIAL_ROUTE_RECALC_STATE, { sequence: 2 });
    const result = applyRecalculationSuccess(started, { sequence: 1, route: NEW_ROUTE });
    expect(result).toBe(started);
  });

  it("新しい sequence で beginRecalculation → 古い sequence の applyRecalculationFailure を適用しても status が recalculating のまま（#9）", () => {
    const firstStarted = beginRecalculation(INITIAL_ROUTE_RECALC_STATE, { sequence: 1 });
    const secondStarted = beginRecalculation(firstStarted, { sequence: 2 });
    const result = applyRecalculationFailure(secondStarted, { sequence: 1, errorCode: "network" });
    expect(result).toBe(secondStarted);
    expect(result.status).toBe("recalculating");
  });
});

describe("resetRecalculation", () => {
  it("INITIAL_ROUTE_RECALC_STATE と等しく、リセット後に古い sequence の成功を適用しても state が変わらない（AC5・#14）", () => {
    const reset = resetRecalculation();
    expect(reset).toEqual(INITIAL_ROUTE_RECALC_STATE);

    const result = applyRecalculationSuccess(reset, { sequence: 5, route: NEW_ROUTE });
    expect(result).toBe(reset);
  });
});
