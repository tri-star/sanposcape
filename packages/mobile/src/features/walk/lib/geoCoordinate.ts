import type { GeoCoordinates } from "@/services/location/types";

/** 緯度の有効範囲（度）。 */
const MIN_LATITUDE = -90;
const MAX_LATITUDE = 90;
/** 経度の有効範囲（度）。 */
const MIN_LONGITUDE = -180;
const MAX_LONGITUDE = 180;

/**
 * 座標が地理的に妥当か判定する純粋関数（NaN/Infinity・緯度±90度／経度±180度超えを弾く）。
 * backend（Pydantic）側で検証済みのはずだが、バグ混入や将来のフォールバック値の伝播に備え、
 * react-native-maps（Marker/Polyline/Region）に渡る直前の最終防波堤として `walkRoute.ts` /
 * `mapRegion.ts` の両方から使う。
 */
export function isValidCoordinate(point: GeoCoordinates): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= MIN_LATITUDE &&
    point.latitude <= MAX_LATITUDE &&
    point.longitude >= MIN_LONGITUDE &&
    point.longitude <= MAX_LONGITUDE
  );
}
