import { describe, expect, it } from "vitest";

import {
  applyRecalculationFailure,
  applyRecalculationSuccess,
  beginRecalculation,
  INITIAL_ROUTE_RECALC_STATE,
  MAX_CONSECUTIVE_AUTO_FAILURES,
  observeRoutePosition,
  RECALCULATION_MIN_INTERVAL_MS,
  REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES,
  resetRecalculation,
  shouldStartRecalculation,
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
  bounds: {
    northEast: { latitude: 35.71, longitude: 139.76 },
    southWest: { latitude: 35.7, longitude: 139.75 },
  },
};

function applyOffRoute(state: RouteRecalcState, times: number): RouteRecalcState {
  let next = state;
  for (let i = 0; i < times; i += 1) {
    next = observeRoutePosition(next, { offRoute: true });
  }
  return next;
}

function offRouteXTimes(times: number): RouteRecalcState {
  return applyOffRoute(INITIAL_ROUTE_RECALC_STATE, times);
}

describe("observeRoutePosition", () => {
  it("offRoute: true を REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES 回連続で observe した後、shouldStartRecalculation が true になる（AC1・#1）", () => {
    const state = offRouteXTimes(REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES);
    expect(state.offRouteCount).toBe(REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES);
    expect(shouldStartRecalculation(state, { hasPosition: true, paused: false, nowMs: 0 })).toBe(
      true,
    );
  });

  it("途中で offRoute: false を挟むと offRouteCount が 0 に戻り、shouldStartRecalculation が false になる（AC1・#2）", () => {
    let state = offRouteXTimes(REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES - 1);
    state = observeRoutePosition(state, { offRoute: false });
    expect(state.offRouteCount).toBe(0);
    expect(shouldStartRecalculation(state, { hasPosition: true, paused: false, nowMs: 0 })).toBe(
      false,
    );
  });

  it("値が変わらないとき同じ参照を返す（#15）", () => {
    const state = INITIAL_ROUTE_RECALC_STATE;
    const next = observeRoutePosition(state, { offRoute: false });
    expect(next).toBe(state);
  });
});

describe("beginRecalculation / applyRecalculationSuccess", () => {
  it("applyRecalculationSuccess 後、status が idle / route が新ルート / errorCode が null / consecutiveFailures が 0（AC1・#3）", () => {
    const started = beginRecalculation(offRouteXTimes(REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES), {
      nowMs: 1000,
      sequence: 1,
    });
    const succeeded = applyRecalculationSuccess(started, { sequence: 1, route: NEW_ROUTE });
    expect(succeeded.status).toBe("idle");
    expect(succeeded.route).toBe(NEW_ROUTE);
    expect(succeeded.errorCode).toBeNull();
    expect(succeeded.consecutiveFailures).toBe(0);
  });

  it("beginRecalculation は route を保持したまま status を recalculating にする（AC3・#6）", () => {
    const withRoute: RouteRecalcState = { ...INITIAL_ROUTE_RECALC_STATE, route: NEW_ROUTE };
    const started = beginRecalculation(withRoute, { nowMs: 1000, sequence: 1 });
    expect(started.status).toBe("recalculating");
    expect(started.route).toBe(NEW_ROUTE);
  });
});

describe("shouldStartRecalculation", () => {
  it("hasPosition: false は false（AC2・#4）", () => {
    const state = offRouteXTimes(REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES);
    expect(shouldStartRecalculation(state, { hasPosition: false, paused: false, nowMs: 0 })).toBe(
      false,
    );
  });

  it("status === recalculating の間は false（同時リクエストを起こさない・AC4・#7）", () => {
    const started = beginRecalculation(offRouteXTimes(REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES), {
      nowMs: 0,
      sequence: 1,
    });
    // beginRecalculation は offRouteCount を 0 に戻すので、しきい値を再度満たしても
    // status ガードで弾かれることを見るために offRouteCount を明示的に積み直す。
    const recalculating: RouteRecalcState = {
      ...started,
      offRouteCount: REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES,
    };
    expect(
      shouldStartRecalculation(recalculating, {
        hasPosition: true,
        paused: false,
        nowMs: RECALCULATION_MIN_INTERVAL_MS * 10,
      }),
    ).toBe(false);
  });

  it("lastRequestAtMs から RECALCULATION_MIN_INTERVAL_MS 未満では false、経過後は true（AC4・#10）", () => {
    const state: RouteRecalcState = {
      ...offRouteXTimes(REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES),
      lastRequestAtMs: 10_000,
    };
    expect(
      shouldStartRecalculation(state, {
        hasPosition: true,
        paused: false,
        nowMs: 10_000 + RECALCULATION_MIN_INTERVAL_MS - 1,
      }),
    ).toBe(false);
    expect(
      shouldStartRecalculation(state, {
        hasPosition: true,
        paused: false,
        nowMs: 10_000 + RECALCULATION_MIN_INTERVAL_MS,
      }),
    ).toBe(true);
  });

  it("paused: true は false（#11）", () => {
    const state = offRouteXTimes(REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES);
    expect(shouldStartRecalculation(state, { hasPosition: true, paused: true, nowMs: 0 })).toBe(
      false,
    );
  });

  it("連続失敗が MAX_CONSECUTIVE_AUTO_FAILURES に達すると自動トリガが止まる／成功で consecutiveFailures が0に戻り再開する（AC3・#12）", () => {
    let state = INITIAL_ROUTE_RECALC_STATE;
    for (let i = 0; i < MAX_CONSECUTIVE_AUTO_FAILURES; i += 1) {
      state = applyOffRoute(state, REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES);
      state = beginRecalculation(state, {
        nowMs: i * RECALCULATION_MIN_INTERVAL_MS,
        sequence: i + 1,
      });
      state = applyRecalculationFailure(state, { sequence: i + 1, errorCode: "network" });
    }
    expect(state.consecutiveFailures).toBe(MAX_CONSECUTIVE_AUTO_FAILURES);

    // 逸脱条件・間隔条件を満たしても、連続失敗数の上限で自動トリガは止まる。
    state = applyOffRoute(state, REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES);
    expect(
      shouldStartRecalculation(state, {
        hasPosition: true,
        paused: false,
        nowMs: RECALCULATION_MIN_INTERVAL_MS * 100,
      }),
    ).toBe(false);

    // 成功で consecutiveFailures が 0 に戻り、再び自動トリガできるようになる。
    const succeededSequence = MAX_CONSECUTIVE_AUTO_FAILURES + 1;
    state = beginRecalculation(state, { nowMs: 0, sequence: succeededSequence });
    state = applyRecalculationSuccess(state, { sequence: succeededSequence, route: NEW_ROUTE });
    expect(state.consecutiveFailures).toBe(0);

    state = applyOffRoute(state, REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES);
    expect(
      shouldStartRecalculation(state, {
        hasPosition: true,
        paused: false,
        nowMs: RECALCULATION_MIN_INTERVAL_MS * 200,
      }),
    ).toBe(true);
  });

  it("再試行しても無駄な分類（unauthorized/invalid_request）で失敗した場合、shouldStartRecalculation が false（AC3・#13）", () => {
    for (const code of ["unauthorized", "invalid_request"] as const) {
      const started = beginRecalculation(offRouteXTimes(REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES), {
        nowMs: 0,
        sequence: 1,
      });
      const failed = applyRecalculationFailure(started, { sequence: 1, errorCode: code });
      const reOffRoute = offRouteXTimes(REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES);
      const nextState: RouteRecalcState = { ...failed, offRouteCount: reOffRoute.offRouteCount };
      expect(
        shouldStartRecalculation(nextState, {
          hasPosition: true,
          paused: false,
          nowMs: RECALCULATION_MIN_INTERVAL_MS * 10,
        }),
      ).toBe(false);
    }
  });
});

describe("applyRecalculationFailure", () => {
  it("失敗しても state.route（直前の成功ルート）が保持され、status が failed / errorCode が入る（AC3・#5）", () => {
    const withRoute: RouteRecalcState = { ...INITIAL_ROUTE_RECALC_STATE, route: NEW_ROUTE };
    const started = beginRecalculation(withRoute, { nowMs: 0, sequence: 1 });
    const failed = applyRecalculationFailure(started, { sequence: 1, errorCode: "network" });
    expect(failed.route).toBe(NEW_ROUTE);
    expect(failed.status).toBe("failed");
    expect(failed.errorCode).toBe("network");
  });
});

describe("多重起動の二重防御（AC4）", () => {
  it("applyRecalculationSuccess に古い sequence を渡すと state が変化しない（同一参照が返る・#8）", () => {
    const started = beginRecalculation(INITIAL_ROUTE_RECALC_STATE, { nowMs: 0, sequence: 2 });
    const result = applyRecalculationSuccess(started, { sequence: 1, route: NEW_ROUTE });
    expect(result).toBe(started);
  });

  it("新しい sequence で beginRecalculation → 古い sequence の applyRecalculationFailure を適用しても status が recalculating のまま（#9）", () => {
    const firstStarted = beginRecalculation(INITIAL_ROUTE_RECALC_STATE, { nowMs: 0, sequence: 1 });
    const secondStarted = beginRecalculation(firstStarted, { nowMs: 1000, sequence: 2 });
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
