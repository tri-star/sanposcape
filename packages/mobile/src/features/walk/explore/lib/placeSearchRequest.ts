import type { ExploreCategory, PlaceSearchRequest } from "@/api/generated/model";
import type { GeoCoordinates } from "@/services/location/types";

export const DURATION_MIN = 10;
export const DURATION_MAX = 120;
export const DURATION_STEP = 5;
/** 1回の探索で取得する候補上限（API の maximum と同値）。 */
export const CANDIDATE_LIMIT = 20;

/** 10..120 にクランプし 5 の倍数へスナップする（API の multipleOf:5 を満たすため）。 */
export function clampRoundTripMinutes(value: number): number {
  const clamped = Math.min(DURATION_MAX, Math.max(DURATION_MIN, value));
  const snapped = Math.round(clamped / DURATION_STEP) * DURATION_STEP;
  return Math.min(DURATION_MAX, Math.max(DURATION_MIN, snapped));
}

/**
 * backend の provider キャッシュキーが小数4桁（places:{lat:.4f}:{lng:.4f}:...）なので、
 * 同じ精度に丸めて送る。GPS のわずかな揺れでキャッシュと TanStack Query の
 * queryKey が毎回変わるのを防ぐ（Places+Routes は1探索で最大21回の外部呼び出しになる）。
 */
export function roundCoordinate(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * 探索リクエストを組み立てる。送信できない条件なら null を返す。
 * - origin が null
 * - categories が空（API の minItems:1 違反 = 422 になる）
 */
export function buildPlaceSearchRequest(input: {
  origin: GeoCoordinates | null;
  durationMin: number;
  categories: readonly ExploreCategory[];
}): PlaceSearchRequest | null {
  const { origin, durationMin, categories } = input;
  if (origin === null || categories.length === 0) {
    return null;
  }

  return {
    origin: {
      latitude: roundCoordinate(origin.latitude),
      longitude: roundCoordinate(origin.longitude),
    },
    round_trip_duration_minutes: clampRoundTripMinutes(durationMin),
    // backend も sorted(categories) でキー化するため、同じ集合なら同じオブジェクトになるよう揃える。
    categories: [...categories].sort(),
    limit: CANDIDATE_LIMIT,
  };
}
