import { describe, expect, it } from "vitest";

import {
  INITIAL_WALK_TRACK,
  MIN_MOVE_METERS,
  appendWalkTrackPoint,
  resumeWalkTrack,
} from "@/features/walk/lib/walkTrack";
import type { GeoCoordinates } from "@/services/location/types";

const ORIGIN: GeoCoordinates = { latitude: 35.681236, longitude: 139.767125 };
/** ORIGIN からおおよそ 30m 北東（appendWalkTrackPoint.ts の MOCK_TRACK と同じ刻み幅）。 */
const NEXT: GeoCoordinates = { latitude: 35.681506, longitude: 139.767395 };
/** ORIGIN からおおよそ 1m 程度しか動かない、GPS の揺れとみなされる点。 */
const JITTER: GeoCoordinates = { latitude: 35.681245, longitude: 139.767125 };

describe("appendWalkTrackPoint", () => {
  it("初回点は距離0で追加される", () => {
    const result = appendWalkTrackPoint(INITIAL_WALK_TRACK, ORIGIN);
    expect(result.points).toEqual([ORIGIN]);
    expect(result.distanceMeters).toBe(0);
    expect(result.lastPoint).toEqual(ORIGIN);
  });

  it("MIN_MOVE_METERS 未満の移動は同一参照が返る", () => {
    const first = appendWalkTrackPoint(INITIAL_WALK_TRACK, ORIGIN);
    const second = appendWalkTrackPoint(first, JITTER);
    expect(second).toBe(first);
  });

  it("閾値以上の移動で距離が加算される", () => {
    const first = appendWalkTrackPoint(INITIAL_WALK_TRACK, ORIGIN);
    const second = appendWalkTrackPoint(first, NEXT);
    expect(second).not.toBe(first);
    expect(second.distanceMeters).toBeGreaterThanOrEqual(MIN_MOVE_METERS);
    expect(second.points).toEqual([ORIGIN, NEXT]);
  });

  it("連続追加で距離が単調増加する", () => {
    const third: GeoCoordinates = { latitude: 35.681776, longitude: 139.767665 };
    let state = appendWalkTrackPoint(INITIAL_WALK_TRACK, ORIGIN);
    state = appendWalkTrackPoint(state, NEXT);
    const afterSecond = state.distanceMeters;
    state = appendWalkTrackPoint(state, third);
    expect(state.distanceMeters).toBeGreaterThan(afterSecond);
  });
});

describe("resumeWalkTrack", () => {
  it("lastPoint が null になり、次点が距離に加算されない（初回扱いになる）", () => {
    const walking = appendWalkTrackPoint(INITIAL_WALK_TRACK, ORIGIN);
    const resumed = resumeWalkTrack(walking);
    expect(resumed.lastPoint).toBeNull();

    const afterResume = appendWalkTrackPoint(resumed, NEXT);
    // resume 直後は「初回点」扱いになるため、距離は加算されず lastPoint だけ更新される。
    expect(afterResume.distanceMeters).toBe(walking.distanceMeters);
    expect(afterResume.lastPoint).toEqual(NEXT);
  });

  it("lastPoint が既に null なら同一 state を返す（冪等）", () => {
    expect(resumeWalkTrack(INITIAL_WALK_TRACK)).toBe(INITIAL_WALK_TRACK);
  });
});
