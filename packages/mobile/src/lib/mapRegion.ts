import { isValidCoordinate } from "@/lib/geoCoordinate";
import type { GeoCoordinates } from "@/services/location/types";

/** react-native-maps の Region と構造的に互換な型（ライブラリを import しないための自前定義）。 */
export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/** delta の下限（極端に近い縮尺で地図が壊れないように）。 */
export const MIN_REGION_DELTA = 0.004;

/** 点群に対して持たせる余白係数。 */
const DEFAULT_PADDING_FACTOR = 1.35;

/**
 * 座標の集合を包含する表示領域を求める。妥当な座標が1点も無ければ null。
 * 日付変更線をまたぐケースは対象外（日本国内前提）。
 *
 * `features/history` の散歩詳細（軌跡 + 目的地）で使う。軌跡は最大10,000点（ADR-003）
 * あるため、`Math.max(...array)` のようなスプレッド展開は使わず、for ループで min/max を求める
 * （スプレッドは引数個数の上限に触れるリスクがあるため）。
 */
export function regionForCoordinates(
  points: readonly GeoCoordinates[],
  paddingFactor: number = DEFAULT_PADDING_FACTOR,
): MapRegion | null {
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let count = 0;

  for (const point of points) {
    if (!isValidCoordinate(point)) continue;
    count += 1;
    if (point.latitude < minLat) minLat = point.latitude;
    if (point.latitude > maxLat) maxLat = point.latitude;
    if (point.longitude < minLng) minLng = point.longitude;
    if (point.longitude > maxLng) maxLng = point.longitude;
  }

  if (count === 0) {
    return null;
  }

  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLng + maxLng) / 2;
  const latitudeDelta = Math.max(MIN_REGION_DELTA, (maxLat - minLat) * paddingFactor);
  const longitudeDelta = Math.max(MIN_REGION_DELTA, (maxLng - minLng) * paddingFactor);

  return { latitude, longitude, latitudeDelta, longitudeDelta };
}
