import { distanceMeters } from "@/features/walk/lib/geoDistance";
import type { GeoCoordinates } from "@/services/location/types";

export type WalkTrackState = {
  /** 採用した軌跡（表示・散歩記録の保存に使う）。 */
  points: GeoCoordinates[];
  /** 累積の実測距離（m）。 */
  distanceMeters: number;
  /** 直近の採用点。一時停止からの再開直後は null にして、停止中の移動を距離に含めない。 */
  lastPoint: GeoCoordinates | null;
};

export const INITIAL_WALK_TRACK: WalkTrackState = {
  points: [],
  distanceMeters: 0,
  lastPoint: null,
};

/** GPS の揺れを距離に加算しないための下限（m）。 */
export const MIN_MOVE_METERS = 5;

/**
 * 1点追加する。移動量が MIN_MOVE_METERS 未満なら state をそのまま返す（参照も同一）。
 */
export function appendWalkTrackPoint(state: WalkTrackState, point: GeoCoordinates): WalkTrackState {
  if (state.lastPoint === null) {
    return {
      points: [...state.points, point],
      distanceMeters: state.distanceMeters,
      lastPoint: point,
    };
  }

  const delta = distanceMeters(state.lastPoint, point);
  if (delta < MIN_MOVE_METERS) {
    return state;
  }

  return {
    points: [...state.points, point],
    distanceMeters: state.distanceMeters + delta,
    lastPoint: point,
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
  };
}
