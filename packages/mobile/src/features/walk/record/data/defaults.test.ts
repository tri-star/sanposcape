import { describe, expect, it } from "vitest";

import { DEFAULT_ACTIVE_WALK, DEFAULT_WALK_GOAL } from "@/features/walk/active/data/defaults";
import {
  SAMPLE_WALK_RESULT,
  SAMPLE_WALK_SUMMARY_STATS,
  buildSampleFinishedWalk,
} from "@/features/walk/record/data/defaults";
import { estimateStepsFromMeters } from "@/features/walk/explore/lib/walkStats";
import { isValidCoordinate } from "@/lib/geoCoordinate";

describe("SAMPLE_WALK_RESULT", () => {
  it("elapsedSec は正の値で、distKm/steps と見て矛盾しない範囲に収まる", () => {
    expect(SAMPLE_WALK_RESULT.elapsedSec).toBeGreaterThan(0);

    const distKm = Number(SAMPLE_WALK_RESULT.distKm);
    const steps = estimateStepsFromMeters(distKm * 1000);

    expect(distKm).toBeGreaterThan(0);
    // 厳密一致は求めない（代表値としての見栄えを優先した静的スタブのため）が、
    // estimateStepsFromMeters の算出値から大きく乖離していないことは保証する。
    expect(Math.abs(steps - SAMPLE_WALK_RESULT.steps)).toBeLessThan(500);
  });

  it("steps は正の整数", () => {
    expect(Number.isInteger(SAMPLE_WALK_RESULT.steps)).toBe(true);
    expect(SAMPLE_WALK_RESULT.steps).toBeGreaterThan(0);
  });

  it("goalName は DEFAULT_WALK_GOAL.name と一致する", () => {
    expect(SAMPLE_WALK_RESULT.goalName).toBe(DEFAULT_WALK_GOAL.name);
  });
});

describe("SAMPLE_WALK_SUMMARY_STATS", () => {
  it("各値が正", () => {
    expect(SAMPLE_WALK_SUMMARY_STATS.elapsedSec).toBeGreaterThan(0);
    expect(SAMPLE_WALK_SUMMARY_STATS.distanceKm).toBeGreaterThan(0);
    expect(SAMPLE_WALK_SUMMARY_STATS.steps).toBeGreaterThan(0);
    expect(SAMPLE_WALK_SUMMARY_STATS.goalName.length).toBeGreaterThan(0);
  });

  it("SAMPLE_WALK_RESULT と整合する", () => {
    expect(SAMPLE_WALK_SUMMARY_STATS.elapsedSec).toBe(SAMPLE_WALK_RESULT.elapsedSec);
    expect(SAMPLE_WALK_SUMMARY_STATS.distanceKm).toBe(Number(SAMPLE_WALK_RESULT.distKm));
    expect(SAMPLE_WALK_SUMMARY_STATS.steps).toBe(SAMPLE_WALK_RESULT.steps);
    expect(SAMPLE_WALK_SUMMARY_STATS.goalName).toBe(SAMPLE_WALK_RESULT.goalName);
  });
});

describe("buildSampleFinishedWalk", () => {
  const NOW_MS = 1_700_000_000_000;
  const CLIENT_WALK_ID = "33333333-3333-4333-8333-333333333333";

  it("startedAtMs < endedAtMs かつ wall-clock が 24h 未満", () => {
    const finished = buildSampleFinishedWalk({ nowMs: NOW_MS, clientWalkId: CLIENT_WALK_ID });

    expect(finished.startedAtMs).toBeLessThan(finished.endedAtMs);
    expect(finished.endedAtMs).toBe(NOW_MS);
    expect(finished.endedAtMs - finished.startedAtMs).toBeLessThan(24 * 60 * 60 * 1000);
  });

  it("clientWalkId が引き継がれる", () => {
    const finished = buildSampleFinishedWalk({ nowMs: NOW_MS, clientWalkId: CLIENT_WALK_ID });
    expect(finished.clientWalkId).toBe(CLIENT_WALK_ID);
  });

  it("track の各点が有効座標", () => {
    const finished = buildSampleFinishedWalk({ nowMs: NOW_MS, clientWalkId: CLIENT_WALK_ID });

    expect(finished.track.length).toBeGreaterThan(1);
    for (const point of finished.track) {
      expect(isValidCoordinate(point)).toBe(true);
    }
  });

  it("track の先頭は origin、末尾は destination.location と一致する", () => {
    const finished = buildSampleFinishedWalk({ nowMs: NOW_MS, clientWalkId: CLIENT_WALK_ID });

    expect(finished.track[0]).toEqual(DEFAULT_ACTIVE_WALK.origin);
    expect(finished.track[finished.track.length - 1]).toEqual(
      DEFAULT_ACTIVE_WALK.destination.location,
    );
  });
});
