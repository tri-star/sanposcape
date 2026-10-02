import { describe, expect, it } from "vitest";

import { distanceMeters } from "@/features/walk/lib/geoDistance";
import {
  INITIAL_WALK_TRACK_SYNC,
  foregroundPositionToSample,
  mergeWalkTrackSamples,
  resumeWalkTrackSync,
} from "@/features/walk/lib/walkTrackMerge";
import type { LocationSample } from "@/services/location/types";

/** 北へ約 `n * 20` m ずつ進む点（5m 未満で捨てられない間隔）。 */
function sample(n: number, timestampMs = n * 1000): LocationSample {
  return {
    latitude: 35 + n * 0.00018,
    longitude: 139,
    timestampMs,
    accuracyMeters: 5,
  };
}

const run = { paused: false };

describe("mergeWalkTrackSamples", () => {
  it("時刻昇順の3点を統合する", () => {
    const next = mergeWalkTrackSamples(
      INITIAL_WALK_TRACK_SYNC,
      [sample(1), sample(2), sample(3)],
      run,
    );
    expect(next.track.points).toHaveLength(3);
    expect(next.track.distanceMeters).toBeGreaterThan(0);
    expect(next.lastSampleAtMs).toBe(3000);
    expect(next.latestPosition).toEqual({ latitude: sample(3).latitude, longitude: 139 });
  });

  it("時刻が逆順のバッチも時刻順に並べて統合する（元の配列は変えない）", () => {
    const batch = [sample(3), sample(1), sample(2)];
    const next = mergeWalkTrackSamples(INITIAL_WALK_TRACK_SYNC, batch, run);
    expect(next.track.points.map((p) => p.latitude)).toEqual([
      sample(1).latitude,
      sample(2).latitude,
      sample(3).latitude,
    ]);
    expect(batch.map((s) => s.timestampMs)).toEqual([3000, 1000, 2000]);
  });

  it("冪等: リスナーで1〜5、バッファの1〜8 を渡すと、1〜8 を1回で統合した結果と同じ", () => {
    const all = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => sample(n));
    const viaListener = mergeWalkTrackSamples(INITIAL_WALK_TRACK_SYNC, all.slice(0, 5), run);
    const viaBuffer = mergeWalkTrackSamples(viaListener, all, run);
    const once = mergeWalkTrackSamples(INITIAL_WALK_TRACK_SYNC, all, run);
    expect(viaBuffer).toEqual(once);
  });

  it("同じバッチ内の同一時刻の点は、先に来た1点だけを軌跡に入れる", () => {
    const first = sample(2, 2000);
    const sameTime = sample(3, 2000);
    const next = mergeWalkTrackSamples(INITIAL_WALK_TRACK_SYNC, [sample(1), first, sameTime], run);
    expect(next.track.points).toEqual([
      { latitude: sample(1).latitude, longitude: 139 },
      { latitude: first.latitude, longitude: 139 },
    ]);
    expect(next.lastSampleAtMs).toBe(2000);
    expect(next.latestPosition).toEqual({ latitude: first.latitude, longitude: 139 });
  });

  it("同一時刻の点を含んでも、1バッチで渡すのと1点ずつ渡すのとで結果が同じ", () => {
    const batch = [sample(1), sample(2, 2000), sample(3, 2000), sample(4)];
    const once = mergeWalkTrackSamples(INITIAL_WALK_TRACK_SYNC, batch, run);
    const oneByOne = batch.reduce(
      (state, s) => mergeWalkTrackSamples(state, [s], run),
      INITIAL_WALK_TRACK_SYNC,
    );
    expect(once).toEqual(oneByOne);
  });

  it("同じ配列を2回渡すと、2回目は同じ参照を返す", () => {
    const first = mergeWalkTrackSamples(INITIAL_WALK_TRACK_SYNC, [sample(1), sample(2)], run);
    const second = mergeWalkTrackSamples(first, [sample(1), sample(2)], run);
    expect(second).toBe(first);
  });

  it("欠落の解消: A → 背面の B1〜B3 → B の順でも A→B の直線にならない", () => {
    const a = sample(1);
    const b1 = sample(2);
    const b2 = sample(3);
    const b3 = sample(4);
    const b = sample(5);
    // 前面: A がリスナー経由で届く。背面の B1〜B3 は JS が止まっていてバッファだけに残る。
    let state = mergeWalkTrackSamples(INITIAL_WALK_TRACK_SYNC, [a], run);
    // 復帰: バッファの全件（A, B1〜B3）を取り込み、その後 B がリスナーで届く。
    state = mergeWalkTrackSamples(state, [a, b1, b2, b3], run);
    state = mergeWalkTrackSamples(state, [b], run);
    expect(state.track.points).toEqual(
      [a, b1, b2, b3, b].map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
    );
    // 距離は各区間の合計（A→B の直線距離ではない）。
    const points = state.track.points;
    const segmentSum = points
      .slice(1)
      .reduce((sum, point, index) => sum + distanceMeters(points[index]!, point), 0);
    expect(state.track.distanceMeters).toBeCloseTo(segmentSum, 6);
  });

  it("paused では軌跡に足さないが、カーソルと latestPosition は進み、再開後の最初の点は距離に加算しない", () => {
    let state = mergeWalkTrackSamples(INITIAL_WALK_TRACK_SYNC, [sample(1)], run);
    const before = state.track;
    state = mergeWalkTrackSamples(state, [sample(2), sample(3)], { paused: true });
    expect(state.track).toBe(before);
    expect(state.lastSampleAtMs).toBe(3000);
    expect(state.latestPosition).toEqual({ latitude: sample(3).latitude, longitude: 139 });

    state = resumeWalkTrackSync(state);
    const distanceBefore = state.track.distanceMeters;
    state = mergeWalkTrackSamples(state, [sample(10)], run);
    expect(state.track.points).toHaveLength(2);
    expect(state.track.distanceMeters).toBe(distanceBefore);
  });

  it("resumeWalkTrackSync は変化が無ければ同じ参照を返す", () => {
    expect(resumeWalkTrackSync(INITIAL_WALK_TRACK_SYNC)).toBe(INITIAL_WALK_TRACK_SYNC);
  });

  it("不正な座標・非数の時刻は捨て、カーソルも進めない", () => {
    const bad: LocationSample[] = [
      { ...sample(1), latitude: Number.NaN },
      { ...sample(2), timestampMs: Number.NaN },
      { ...sample(3), longitude: 200 },
    ];
    const next = mergeWalkTrackSamples(INITIAL_WALK_TRACK_SYNC, bad, run);
    expect(next).toBe(INITIAL_WALK_TRACK_SYNC);
  });

  it("軌跡の点は { latitude, longitude } だけを持つ", () => {
    const next = mergeWalkTrackSamples(INITIAL_WALK_TRACK_SYNC, [sample(1)], run);
    expect(Object.keys(next.track.points[0]!).sort()).toEqual(["latitude", "longitude"]);
  });

  it("5m 未満の移動は appendWalkTrackPoint の規則どおり捨てる", () => {
    const near: LocationSample = {
      ...sample(1),
      latitude: sample(1).latitude + 0.00001,
      timestampMs: 2000,
    };
    const next = mergeWalkTrackSamples(INITIAL_WALK_TRACK_SYNC, [sample(1), near], run);
    expect(next.track.points).toHaveLength(1);
    expect(next.lastSampleAtMs).toBe(2000);
  });
});

describe("foregroundPositionToSample", () => {
  it("渡した時刻と accuracy null を持つ", () => {
    expect(foregroundPositionToSample({ latitude: 1, longitude: 2 }, 123)).toEqual({
      latitude: 1,
      longitude: 2,
      timestampMs: 123,
      accuracyMeters: null,
    });
  });
});
