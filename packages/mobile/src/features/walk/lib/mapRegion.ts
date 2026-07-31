import type { WalkRouteBounds } from "@/features/walk/types";
import type { GeoCoordinates } from "@/services/location/types";

/** react-native-maps の Region と構造的に互換な型（ライブラリを import しないための自前定義）。 */
export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/** 徒歩の平均速度（m/分）。往復時間から片道の到達半径を見積もる。 */
export const WALKING_METERS_PER_MINUTE = 80;

/** 緯度1度あたりのおおよその距離（m）。 */
const METERS_PER_DEGREE_LATITUDE = 111_320;

/** 表示領域に持たせる余白係数（到達半径ぴったりだと窮屈になるため）。 */
const REGION_PADDING_FACTOR = 1.6;

/** delta の下限（極端に近い縮尺で地図が壊れないように）。 */
const MIN_DELTA = 0.004;

/** 高緯度での longitudeDelta 発散を防ぐための cos の下限（≒ 緯度84度相当）。 */
const MIN_COS_LATITUDE = 0.1;

/** 往復◯分から片道の到達半径（m）を見積もる。 */
export function radiusMetersForRoundTrip(durationMin: number): number {
  // 往復時間の半分だけ歩いて折り返すと仮定する。
  return (durationMin / 2) * WALKING_METERS_PER_MINUTE;
}

/**
 * 中心と往復時間から地図の表示領域を求める。
 * latitudeDelta = 直径 * 余白係数 / 111,320m、longitudeDelta = latitudeDelta / cos(lat)。
 * 高緯度で発散しないよう cos は 0.1 で下限クランプし、delta には最小値 0.004 を設ける。
 */
export function regionForRoundTrip(center: GeoCoordinates, durationMin: number): MapRegion {
  const radiusMeters = radiusMetersForRoundTrip(durationMin);
  const diameterMeters = radiusMeters * 2 * REGION_PADDING_FACTOR;

  const latitudeDelta = Math.max(MIN_DELTA, diameterMeters / METERS_PER_DEGREE_LATITUDE);

  const cosLatitude = Math.max(MIN_COS_LATITUDE, Math.cos((center.latitude * Math.PI) / 180));
  const longitudeDelta = Math.max(MIN_DELTA, latitudeDelta / cosLatitude);

  return {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta,
    longitudeDelta,
  };
}

/** bounds に対して持たせる余白係数（ルート全体を少し引いて表示する）。 */
const BOUNDS_PADDING_FACTOR = 1.35;

/**
 * ルートの bounds から地図の表示領域を求める。
 * delta は既存の MIN_DELTA で下限クランプする（1点に潰れた bounds でも壊れないように）。
 * 日付変更線をまたぐケースは対象外（日本国内前提）。
 */
export function regionForBounds(bounds: WalkRouteBounds): MapRegion {
  const { northEast, southWest } = bounds;

  const latitude = (northEast.latitude + southWest.latitude) / 2;
  const longitude = (northEast.longitude + southWest.longitude) / 2;

  const latitudeDelta = Math.max(
    MIN_DELTA,
    Math.abs(northEast.latitude - southWest.latitude) * BOUNDS_PADDING_FACTOR,
  );
  const longitudeDelta = Math.max(
    MIN_DELTA,
    Math.abs(northEast.longitude - southWest.longitude) * BOUNDS_PADDING_FACTOR,
  );

  return { latitude, longitude, latitudeDelta, longitudeDelta };
}
