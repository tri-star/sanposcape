import { describe, expect, it } from "vitest";

import { buildFinishedWalk, toWalkSummaryStats } from "@/features/walk/lib/finishedWalk";
import { estimateStepsFromMeters } from "@/features/walk/lib/walkStats";
import type { ActiveWalk } from "@/features/walk/types";

const ACTIVE_WALK: ActiveWalk = {
  clientWalkId: "11111111-1111-4111-8111-111111111111",
  origin: { latitude: 35.681236, longitude: 139.767125 },
  destination: {
    placeId: "place-1",
    name: "緑町公園",
    location: { latitude: 35.6875, longitude: 139.7625 },
  },
  roundTripMinutes: 40,
  roundTripKm: 2.6,
  startedAtMs: 1_000_000,
};

describe("buildFinishedWalk", () => {
  it("ActiveWalk からドラフトが組める（clientWalkId / startedAtMs が引き継がれる）", () => {
    const finished = buildFinishedWalk({
      activeWalk: ACTIVE_WALK,
      elapsedSec: 120,
      distanceMeters: 500,
      points: [],
      endedAtMs: ACTIVE_WALK.startedAtMs + 120_000,
    });

    expect(finished.clientWalkId).toBe(ACTIVE_WALK.clientWalkId);
    expect(finished.startedAtMs).toBe(ACTIVE_WALK.startedAtMs);
    expect(finished.destination).toEqual(ACTIVE_WALK.destination);
  });

  it("endedAtMs <= startedAtMs のとき startedAtMs + 1000 に補正される", () => {
    const finished = buildFinishedWalk({
      activeWalk: ACTIVE_WALK,
      elapsedSec: 0,
      distanceMeters: 0,
      points: [],
      endedAtMs: ACTIVE_WALK.startedAtMs,
    });

    expect(finished.endedAtMs).toBe(ACTIVE_WALK.startedAtMs + 1000);
  });

  it("endedAtMs が startedAtMs より前でも同様に補正される", () => {
    const finished = buildFinishedWalk({
      activeWalk: ACTIVE_WALK,
      elapsedSec: 0,
      distanceMeters: 0,
      points: [],
      endedAtMs: ACTIVE_WALK.startedAtMs - 5000,
    });

    expect(finished.endedAtMs).toBe(ACTIVE_WALK.startedAtMs + 1000);
  });

  it("elapsedSec が wall-clock 秒を超えない", () => {
    const finished = buildFinishedWalk({
      activeWalk: ACTIVE_WALK,
      elapsedSec: 10_000, // wall-clock（10秒）よりずっと大きい値
      distanceMeters: 0,
      points: [],
      endedAtMs: ACTIVE_WALK.startedAtMs + 10_000,
    });

    expect(finished.elapsedSec).toBe(10);
  });

  it("elapsedSec が非有限値・負値で0になる", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -5]) {
      const finished = buildFinishedWalk({
        activeWalk: ACTIVE_WALK,
        elapsedSec: value,
        distanceMeters: 0,
        points: [],
        endedAtMs: ACTIVE_WALK.startedAtMs + 60_000,
      });
      expect(finished.elapsedSec).toBe(0);
    }
  });

  it("distanceMeters が非有限値・負値で0になる", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -100]) {
      const finished = buildFinishedWalk({
        activeWalk: ACTIVE_WALK,
        elapsedSec: 0,
        distanceMeters: value,
        points: [],
        endedAtMs: ACTIVE_WALK.startedAtMs + 60_000,
      });
      expect(finished.distanceMeters).toBe(0);
    }
  });

  it("distanceMeters は四捨五入される", () => {
    const finished = buildFinishedWalk({
      activeWalk: ACTIVE_WALK,
      elapsedSec: 0,
      distanceMeters: 123.6,
      points: [],
      endedAtMs: ACTIVE_WALK.startedAtMs + 60_000,
    });
    expect(finished.distanceMeters).toBe(124);
  });

  it("track が引数配列と別インスタンス", () => {
    const points = [{ latitude: 35.68, longitude: 139.76 }];
    const finished = buildFinishedWalk({
      activeWalk: ACTIVE_WALK,
      elapsedSec: 0,
      distanceMeters: 0,
      points,
      endedAtMs: ACTIVE_WALK.startedAtMs + 60_000,
    });

    expect(finished.track).toEqual(points);
    expect(finished.track).not.toBe(points);
  });
});

describe("toWalkSummaryStats", () => {
  it("km（小数1桁）・歩数・ゴール名を返す", () => {
    const finished = buildFinishedWalk({
      activeWalk: ACTIVE_WALK,
      elapsedSec: 1800,
      distanceMeters: 2143,
      points: [],
      endedAtMs: ACTIVE_WALK.startedAtMs + 1_800_000,
    });

    const stats = toWalkSummaryStats(finished);

    expect(stats.elapsedSec).toBe(1800);
    expect(stats.distanceKm).toBe(2.1);
    expect(stats.steps).toBe(estimateStepsFromMeters(2143));
    expect(stats.goalName).toBe("緑町公園");
  });

  it("destination.name が空でもフォールバック文言になる", () => {
    const finished = buildFinishedWalk({
      activeWalk: { ...ACTIVE_WALK, destination: { ...ACTIVE_WALK.destination, name: "  " } },
      elapsedSec: 0,
      distanceMeters: 0,
      points: [],
      endedAtMs: ACTIVE_WALK.startedAtMs + 60_000,
    });

    expect(toWalkSummaryStats(finished).goalName).toBe("目的地");
  });
});
