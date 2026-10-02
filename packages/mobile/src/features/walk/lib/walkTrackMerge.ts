import { isValidCoordinate } from "@/lib/geoCoordinate";
import {
  INITIAL_WALK_TRACK,
  appendWalkTrackPoint,
  resumeWalkTrack,
} from "@/features/walk/lib/walkTrack";
import type { WalkTrackState } from "@/features/walk/lib/walkTrack";
import type { GeoCoordinates, LocationSample } from "@/services/location/types";

export type WalkTrackSync = {
  track: WalkTrackState;
  /** 取り込み済みの最新の測位時刻（ms）。これ以下の時刻のサンプルは取り込み済みとして捨てる。 */
  lastSampleAtMs: number | null;
  /** 直近の測位（一時停止中も更新する。現在地マーカー用）。 */
  latestPosition: GeoCoordinates | null;
};

export const INITIAL_WALK_TRACK_SYNC: WalkTrackSync = {
  track: INITIAL_WALK_TRACK,
  lastSampleAtMs: null,
  latestPosition: null,
};

/**
 * サンプルを統合する純粋関数。何度同じサンプルを渡しても結果が変わらない（冪等）。
 * 1. 座標が不正（isValidCoordinate が false）・時刻が有限でないサンプルは捨てる（カーソルも進めない）
 * 2. lastSampleAtMs 以下の時刻は捨てる（リスナーとバッファの両方から届く同じ点を二重に足さない）。
 *    同じバッチ内の同一時刻も、先に来た1点だけを採る
 * 3. 残りを時刻の昇順に並べる（Android はまとめて届くことがある。元の配列は変えない）
 * 4. 順に: latestPosition を更新し、paused でなければ appendWalkTrackPoint で軌跡に足す
 *    （一時停止中もカーソルは進める＝停止中の移動は後から取り込み直さない）
 * 5. 新しいサンプルが無ければ state を同じ参照で返す（無駄な再レンダーを避ける）
 * 軌跡に入れる点は { latitude, longitude } だけに詰め直す（FinishedWalk.track は GeoCoordinates[]）。
 */
export function mergeWalkTrackSamples(
  state: WalkTrackSync,
  samples: readonly LocationSample[],
  options: { paused: boolean },
): WalkTrackSync {
  const cursor = state.lastSampleAtMs;
  const fresh = samples
    .filter(
      (sample) =>
        Number.isFinite(sample.timestampMs) &&
        isValidCoordinate(sample) &&
        (cursor === null || sample.timestampMs > cursor),
    )
    .sort((a, b) => a.timestampMs - b.timestampMs);
  if (fresh.length === 0) return state;

  let track = state.track;
  let latestPosition = state.latestPosition;
  let lastSampleAtMs = cursor;
  for (const sample of fresh) {
    // 同じバッチ内の同一時刻（昇順に並べたので直前と同じ時刻）も重複として捨てる。
    // 先に来た点を採る（sort は安定）。別々のバッチで渡したときと結果を揃えるため。
    if (lastSampleAtMs !== null && sample.timestampMs <= lastSampleAtMs) continue;
    const point: GeoCoordinates = { latitude: sample.latitude, longitude: sample.longitude };
    latestPosition = point;
    lastSampleAtMs = sample.timestampMs;
    if (!options.paused) track = appendWalkTrackPoint(track, point);
  }
  return { track, lastSampleAtMs, latestPosition };
}

/** 一時停止からの再開。track に resumeWalkTrack を適用する（変わらなければ同じ参照を返す）。 */
export function resumeWalkTrackSync(state: WalkTrackSync): WalkTrackSync {
  const track = resumeWalkTrack(state.track);
  return track === state.track ? state : { ...state, track };
}

/** fallback（watchPosition）の通知を LocationSample にする。時刻は呼び出し側が渡す（純粋に保つ）。 */
export function foregroundPositionToSample(
  position: GeoCoordinates,
  nowMs: number,
): LocationSample {
  return {
    latitude: position.latitude,
    longitude: position.longitude,
    timestampMs: nowMs,
    accuracyMeters: null,
  };
}
