import { describe, expect, it, vi } from "vitest";

import * as geoDistance from "@/features/walk/lib/geoDistance";
import {
  INITIAL_WALK_TRACK,
  JUMP_MIN_METERS,
  MAX_PLAUSIBLE_SPEED_MPS,
  MIN_MOVE_METERS,
  appendWalkTrackPoint,
  resumeWalkTrack,
} from "@/features/walk/lib/walkTrack";
import { MOCK_TRACK } from "@/services/location/location.mock";
import type { GeoCoordinates } from "@/services/location/types";

// 実際の測地計算（Haversine）では、緯度経度から「移動量がちょうど MIN_MOVE_METERS」となる
// 座標を作っても浮動小数点誤差で 4.999999999... 等にずれてしまい、`<` と `<=` の境界を
// 確実には検証できない。そのため `distanceMeters` だけをスパイして境界値ちょうどを返させ、
// 判定ロジック（`appendWalkTrackPoint`）側の境界仕様だけを切り出してテストする。
// 他のテストでは実装（`actual`）をそのまま使うため、既存の挙動には影響しない。
vi.mock("@/features/walk/lib/geoDistance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/walk/lib/geoDistance")>();
  return { ...actual, distanceMeters: vi.fn(actual.distanceMeters) };
});

const ORIGIN: GeoCoordinates = { latitude: 35.681236, longitude: 139.767125 };
/** ORIGIN からおおよそ 30m 北東（appendWalkTrackPoint.ts の MOCK_TRACK と同じ刻み幅）。 */
const NEXT: GeoCoordinates = { latitude: 35.681506, longitude: 139.767395 };
/** ORIGIN からおおよそ 1m 程度しか動かない、GPS の揺れとみなされる点。 */
const JITTER: GeoCoordinates = { latitude: 35.681245, longitude: 139.767125 };

describe("appendWalkTrackPoint", () => {
  it("初回点は距離0で追加される", () => {
    const result = appendWalkTrackPoint(INITIAL_WALK_TRACK, ORIGIN, 0);
    expect(result.points).toEqual([ORIGIN]);
    expect(result.distanceMeters).toBe(0);
    expect(result.lastPoint).toEqual(ORIGIN);
    expect(result.lastPointAtMs).toBe(0);
  });

  it("MIN_MOVE_METERS 未満の移動は同一参照が返る", () => {
    const first = appendWalkTrackPoint(INITIAL_WALK_TRACK, ORIGIN, 0);
    const second = appendWalkTrackPoint(first, JITTER, 10_000);
    expect(second).toBe(first);
  });

  it("閾値以上の移動で距離が加算される", () => {
    const first = appendWalkTrackPoint(INITIAL_WALK_TRACK, ORIGIN, 0);
    const second = appendWalkTrackPoint(first, NEXT, 10_000);
    expect(second).not.toBe(first);
    expect(second.distanceMeters).toBeGreaterThanOrEqual(MIN_MOVE_METERS);
    expect(second.points).toEqual([ORIGIN, NEXT]);
  });

  it("MIN_MOVE_METERS ちょうどの移動は加算される（判定は `delta < MIN_MOVE_METERS` であり `<=` ではない）", () => {
    vi.mocked(geoDistance.distanceMeters).mockReturnValueOnce(MIN_MOVE_METERS);

    const first = appendWalkTrackPoint(INITIAL_WALK_TRACK, ORIGIN, 0);
    const second = appendWalkTrackPoint(first, NEXT, 10_000);

    expect(second).not.toBe(first);
    expect(second.distanceMeters).toBe(MIN_MOVE_METERS);
    expect(second.points).toEqual([ORIGIN, NEXT]);
    expect(second.lastPoint).toEqual(NEXT);
  });

  it("連続追加で距離が単調増加する", () => {
    const third: GeoCoordinates = { latitude: 35.681776, longitude: 139.767665 };
    let state = appendWalkTrackPoint(INITIAL_WALK_TRACK, ORIGIN, 0);
    state = appendWalkTrackPoint(state, NEXT, 10_000);
    const afterSecond = state.distanceMeters;
    state = appendWalkTrackPoint(state, third, 20_000);
    expect(state.distanceMeters).toBeGreaterThan(afterSecond);
  });
});

describe("appendWalkTrackPoint の GPS の飛び（SS-91）", () => {
  /** ORIGIN からおおよそ 5km 北（`adb emu geo fix` で一気に移動した先）。 */
  const FAR: GeoCoordinates = { latitude: 35.726236, longitude: 139.767125 };

  it("数 km を数秒で移動した点は距離に加算せず、軌跡には足して次の基準点にする", () => {
    const first = appendWalkTrackPoint(INITIAL_WALK_TRACK, ORIGIN, 0);
    const jumped = appendWalkTrackPoint(first, FAR, 3_000);
    expect(jumped.distanceMeters).toBe(0);
    expect(jumped.points).toEqual([ORIGIN, FAR]);
    expect(jumped.lastPoint).toEqual(FAR);
    expect(jumped.lastPointAtMs).toBe(3_000);
  });

  it("飛んだ先から歩き続けた分は加算する", () => {
    const farNext: GeoCoordinates = { latitude: FAR.latitude + 0.00027, longitude: FAR.longitude };
    let state = appendWalkTrackPoint(INITIAL_WALK_TRACK, ORIGIN, 0);
    state = appendWalkTrackPoint(state, FAR, 3_000);
    state = appendWalkTrackPoint(state, farNext, 33_000);
    expect(state.distanceMeters).toBeCloseTo(geoDistance.distanceMeters(FAR, farNext), 6);
  });

  it("外れて戻る飛び（A → 遠く → A の近く）は行きも戻りも加算しない", () => {
    let state = appendWalkTrackPoint(INITIAL_WALK_TRACK, ORIGIN, 0);
    state = appendWalkTrackPoint(state, FAR, 3_000);
    state = appendWalkTrackPoint(state, NEXT, 6_000);
    expect(state.distanceMeters).toBe(0);
    expect(state.points).toEqual([ORIGIN, FAR, NEXT]);
  });

  it("遠くても経過時間が長ければ（背面での記録の欠けなど）加算する", () => {
    const first = appendWalkTrackPoint(INITIAL_WALK_TRACK, ORIGIN, 0);
    // 約 5km を 1 時間（約 1.4 m/s）。
    const second = appendWalkTrackPoint(first, FAR, 3_600_000);
    expect(second.distanceMeters).toBeCloseTo(geoDistance.distanceMeters(ORIGIN, FAR), 6);
  });

  it("JUMP_MIN_METERS 未満の移動は速くても加算する", () => {
    vi.mocked(geoDistance.distanceMeters).mockReturnValueOnce(JUMP_MIN_METERS - 1);
    const first = appendWalkTrackPoint(INITIAL_WALK_TRACK, ORIGIN, 0);
    const second = appendWalkTrackPoint(first, NEXT, 100);
    expect(second.distanceMeters).toBe(JUMP_MIN_METERS - 1);
  });

  it("JUMP_MIN_METERS ちょうどで速すぎる移動は飛びとみなす", () => {
    vi.mocked(geoDistance.distanceMeters).mockReturnValueOnce(JUMP_MIN_METERS);
    const first = appendWalkTrackPoint(INITIAL_WALK_TRACK, ORIGIN, 0);
    const second = appendWalkTrackPoint(first, NEXT, 1_000);
    expect(second.distanceMeters).toBe(0);
    expect(second.lastPoint).toEqual(NEXT);
  });

  it("MAX_PLAUSIBLE_SPEED_MPS ちょうどの速さは加算する（判定は `>` であり `>=` ではない）", () => {
    const meters = MAX_PLAUSIBLE_SPEED_MPS * 10;
    vi.mocked(geoDistance.distanceMeters).mockReturnValueOnce(meters);
    const first = appendWalkTrackPoint(INITIAL_WALK_TRACK, ORIGIN, 0);
    const second = appendWalkTrackPoint(first, NEXT, 10_000);
    expect(second.distanceMeters).toBe(meters);
  });

  it("時刻が同じ・戻っている点は、JUMP_MIN_METERS 以上なら飛びとみなす", () => {
    const first = appendWalkTrackPoint(INITIAL_WALK_TRACK, ORIGIN, 10_000);
    expect(appendWalkTrackPoint(first, FAR, 10_000).distanceMeters).toBe(0);
    expect(appendWalkTrackPoint(first, FAR, 5_000).distanceMeters).toBe(0);
  });

  it("mock の軌跡（MOCK_TRACK を 1 秒ごと）は飛びとみなさない", () => {
    let state = INITIAL_WALK_TRACK;
    MOCK_TRACK.forEach((point, index) => {
      state = appendWalkTrackPoint(state, point, index * 1_000);
    });
    let expected = 0;
    for (let i = 1; i < MOCK_TRACK.length; i += 1) {
      expected += geoDistance.distanceMeters(MOCK_TRACK[i - 1]!, MOCK_TRACK[i]!);
    }
    expect(state.points).toHaveLength(MOCK_TRACK.length);
    expect(state.distanceMeters).toBeCloseTo(expected, 6);
  });
});

describe("resumeWalkTrack", () => {
  it("lastPoint が null になり、次点が距離に加算されない（初回扱いになる）", () => {
    const walking = appendWalkTrackPoint(INITIAL_WALK_TRACK, ORIGIN, 0);
    const resumed = resumeWalkTrack(walking);
    expect(resumed.lastPoint).toBeNull();
    expect(resumed.lastPointAtMs).toBeNull();

    const afterResume = appendWalkTrackPoint(resumed, NEXT, 10_000);
    // resume 直後は「初回点」扱いになるため、距離は加算されず lastPoint だけ更新される。
    expect(afterResume.distanceMeters).toBe(walking.distanceMeters);
    expect(afterResume.lastPoint).toEqual(NEXT);
  });

  it("lastPoint が既に null なら同一 state を返す（冪等）", () => {
    expect(resumeWalkTrack(INITIAL_WALK_TRACK)).toBe(INITIAL_WALK_TRACK);
  });
});
