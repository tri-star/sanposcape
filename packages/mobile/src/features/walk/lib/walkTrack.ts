import { distanceMeters } from "@/features/walk/lib/geoDistance";
import type { GeoCoordinates } from "@/services/location/types";

export type WalkTrackState = {
  /** 採用した軌跡（表示・散歩記録の保存に使う）。 */
  points: GeoCoordinates[];
  /** 累積の実測距離（m）。 */
  distanceMeters: number;
  /** 直近の採用点。一時停止からの再開直後は null にして、停止中の移動を距離に含めない。 */
  lastPoint: GeoCoordinates | null;
  /** lastPoint の測位時刻（Unix ミリ秒）。lastPoint が null なら null。飛びの判定に使う。 */
  lastPointAtMs: number | null;
};

export const INITIAL_WALK_TRACK: WalkTrackState = {
  points: [],
  distanceMeters: 0,
  lastPoint: null,
  lastPointAtMs: null,
};

/** GPS の揺れを距離に加算しないための下限（m）。 */
export const MIN_MOVE_METERS = 5;

/**
 * GPS の飛びとみなす移動量の下限（m）。OS の通知間隔（10m・3秒。ADR-M-018）の数倍で、
 * 普通の歩行の1区間では届かない。時刻の近い2点を速さだけで飛びと判定しないための条件。
 */
export const JUMP_MIN_METERS = 50;

/** 徒歩（走っても）では超えない速さ（m/s。36 km/h）。これを超える移動は GPS の飛びとみなす。 */
export const MAX_PLAUSIBLE_SPEED_MPS = 10;

/**
 * 直前の採用点からの移動が GPS の飛びか。JUMP_MIN_METERS 以上、かつ MAX_PLAUSIBLE_SPEED_MPS を超える速さ。
 * 時刻が戻っている・同じ（経過 0 以下）なら、距離の条件だけで判定する。
 */
function isJump(delta: number, elapsedMs: number): boolean {
  if (delta < JUMP_MIN_METERS) return false;
  if (elapsedMs <= 0) return true;
  return delta / (elapsedMs / 1000) > MAX_PLAUSIBLE_SPEED_MPS;
}

/**
 * 1点追加する。timestampMs は point の測位時刻。
 * - 移動量が MIN_MOVE_METERS 未満なら state をそのまま返す（参照も同一）。
 * - GPS の飛び（isJump）なら距離に加算せず、軌跡には足して次の基準点にする（再開直後の1点と同じ扱い）。
 *   外れて戻る飛びは行きも戻りも加算されず、本当に遠くへ移った場合はその1区間だけ加算しない。
 */
export function appendWalkTrackPoint(
  state: WalkTrackState,
  point: GeoCoordinates,
  timestampMs: number,
): WalkTrackState {
  if (state.lastPoint === null || state.lastPointAtMs === null) {
    return {
      points: [...state.points, point],
      distanceMeters: state.distanceMeters,
      lastPoint: point,
      lastPointAtMs: timestampMs,
    };
  }

  const delta = distanceMeters(state.lastPoint, point);
  if (delta < MIN_MOVE_METERS) {
    return state;
  }

  const jumped = isJump(delta, timestampMs - state.lastPointAtMs);
  return {
    points: [...state.points, point],
    distanceMeters: jumped ? state.distanceMeters : state.distanceMeters + delta,
    lastPoint: point,
    lastPointAtMs: timestampMs,
  };
}

/**
 * 一時停止からの再開。lastPoint を落として停止中の変位を計上しないようにする。
 */
export function resumeWalkTrack(state: WalkTrackState): WalkTrackState {
  if (state.lastPoint === null) {
    return state;
  }
  return {
    points: state.points,
    distanceMeters: state.distanceMeters,
    lastPoint: null,
    lastPointAtMs: null,
  };
}
