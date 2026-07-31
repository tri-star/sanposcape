import type { WalkingRouteResponse } from "@/api/generated/model";
import type { WalkRoute } from "@/features/walk/types";

/** 非有限値・負値を 0 にフォールバックする（`spotCandidate.ts` の `toNonNegative` と同じ考え方）。 */
function toNonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * WalkingRouteResponse を画面用 WalkRoute に整形する。表示名はレスポンスではなく引数の name を優先する。
 * backend は destination.name 未指定時に place_id を name として返す仕様のため、
 * 選択したカードの名前（fallbackName）を正とする（place_id が画面に出る事故を避けるため）。
 */
export function toWalkRoute(response: WalkingRouteResponse, fallbackName?: string): WalkRoute {
  return {
    origin: {
      latitude: response.origin.latitude,
      longitude: response.origin.longitude,
    },
    destination: {
      placeId: response.destination.place_id,
      name: fallbackName ?? response.destination.name,
      location: {
        latitude: response.destination.location.latitude,
        longitude: response.destination.location.longitude,
      },
    },
    durationSeconds: toNonNegative(response.duration_seconds),
    distanceMeters: toNonNegative(response.distance_meters),
    path: response.path.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    })),
    bounds: {
      northEast: {
        latitude: response.bounds.north_east.latitude,
        longitude: response.bounds.north_east.longitude,
      },
      southWest: {
        latitude: response.bounds.south_west.latitude,
        longitude: response.bounds.south_west.longitude,
      },
    },
  };
}

/** 片道秒数 → 片道の分（四捨五入）。 */
export function toOneWayMinutes(durationSeconds: number): number {
  return Math.round(toNonNegative(durationSeconds) / 60);
}

/**
 * 片道秒数 → 往復の目安（分。四捨五入）。ルートAPIは片道値のため2倍する。
 * これは「同じ道を戻る」前提の近似値。往路と復路が異なる周回ルートの実値は SS-33 で扱う。
 */
export function estimateRoundTripMinutes(durationSeconds: number): number {
  return Math.round((toNonNegative(durationSeconds) * 2) / 60);
}

/** メートル → km（小数1桁）。 */
export function toKilometers(meters: number): number {
  return Math.round(toNonNegative(meters) / 100) / 10;
}
