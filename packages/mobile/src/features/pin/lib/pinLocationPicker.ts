import { isValidCoordinate } from "@/lib/geoCoordinate";
import type { MapRegion } from "@/lib/mapRegion";
import type { GeoCoordinates } from "@/services/location/types";

/** 全画面地図で1点を見せるときの表示範囲（緯度経度の差）。約 800m 四方。 */
export const PIN_MAP_POINT_DELTA = 0.008;

/**
 * 「日本全体」として初期表示に収める範囲（おおよその端）。
 * 南端は波照間島、西端は与那国島、北端は宗谷岬、東端は納沙布岬。沖ノ鳥島・南鳥島などの遠い離島は
 * 含めると本州が小さくなりすぎるため対象外にする。
 */
export const JAPAN_DISPLAY_BOUNDS = {
  south: 24.0,
  north: 45.6,
  west: 122.9,
  east: 145.9,
} as const;

/** 端の地点が画面の縁に貼り付かないように、上下左右に足す余白（度）。 */
const JAPAN_DISPLAY_MARGIN = 1;

/**
 * 現在地が取れないとき（権限拒否・取得失敗）の初期表示。日本全体（`JAPAN_DISPLAY_BOUNDS` から計算）。
 * 特定の地点（東京駅など）にしないのは、ユーザーに無関係な場所を「起点」として見せないため。
 */
export const PIN_PICKER_FALLBACK_REGION: MapRegion = {
  latitude: (JAPAN_DISPLAY_BOUNDS.south + JAPAN_DISPLAY_BOUNDS.north) / 2,
  longitude: (JAPAN_DISPLAY_BOUNDS.west + JAPAN_DISPLAY_BOUNDS.east) / 2,
  latitudeDelta: JAPAN_DISPLAY_BOUNDS.north - JAPAN_DISPLAY_BOUNDS.south + JAPAN_DISPLAY_MARGIN * 2,
  longitudeDelta: JAPAN_DISPLAY_BOUNDS.east - JAPAN_DISPLAY_BOUNDS.west + JAPAN_DISPLAY_MARGIN * 2,
};

/** 1点を中心にした表示範囲。 */
export function regionAroundPoint(
  point: GeoCoordinates,
  delta: number = PIN_MAP_POINT_DELTA,
): MapRegion {
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

export type PickerStartRegion = { region: MapRegion; source: "current" | "fallback" };

/**
 * 地点選択画面の初期表示範囲を決める。
 * - 妥当な現在地があれば、そこを中心に（source: "current"）。isLoading 中でも座標があれば
 *   current（再試行中の場合）
 * - 座標が無く isLoading 中なら null（まだ地図を出さない）
 * - 座標が無い、または不正（isValidCoordinate が false）で、取得が終わっていれば fallback
 */
export function resolvePickerStartRegion(input: {
  isLoading: boolean;
  coordinates: GeoCoordinates | null;
}): PickerStartRegion | null {
  if (input.coordinates !== null && isValidCoordinate(input.coordinates)) {
    return { region: regionAroundPoint(input.coordinates), source: "current" };
  }
  if (input.isLoading) {
    return null;
  }
  return { region: PIN_PICKER_FALLBACK_REGION, source: "fallback" };
}

/**
 * react-native-maps のイベント（nativeEvent.coordinate）から受け取った座標を検証する。
 * 未定義・NaN・範囲外は null（地図には渡さない・遷移しない）。
 * 引数は `{ latitude: number; longitude: number } | null | undefined` を受ける
 * （react-native-maps の LatLng 型は import しない。構造的に互換）。
 */
export function toPickedCoordinate(
  raw: { latitude: number; longitude: number } | null | undefined,
): GeoCoordinates | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const coordinates: GeoCoordinates = { latitude: raw.latitude, longitude: raw.longitude };
  return isValidCoordinate(coordinates) ? coordinates : null;
}

/**
 * `/pins/new` のルートパラメータを組み立てる（地点選択画面の長押し → 登録画面）。
 * キー名・値の形式（`String(n)`・丸めない）は `features/walk/lib/addPinAction.ts` と同じにし、
 * `parsePinLocationParams` がそのまま読めることをテストで固定する。clientWalkId は含めない
 * （D2: FAB 経由の登録に散歩の紐付けは無い）。
 */
export function buildPinNewRouteParams(location: GeoCoordinates): {
  latitude: string;
  longitude: string;
} {
  return {
    latitude: String(location.latitude),
    longitude: String(location.longitude),
  };
}
