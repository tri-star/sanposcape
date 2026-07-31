import type { WalkingRouteResponse } from "@/api/generated/model";
import { isValidCoordinate } from "@/features/walk/lib/geoCoordinate";
import type { WalkRoute, WalkRouteBounds } from "@/features/walk/types";
import type { GeoCoordinates } from "@/services/location/types";

/** 非有限値・負値を 0 にフォールバックする（`spotCandidate.ts` の `toNonNegative` と同じ考え方）。 */
function toNonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * レスポンス由来の座標を検証済みで取得できなかったことを示すエラー。
 * `origin` / `destination.location` は「往復ルートの起点・終点」という単一の点であり、
 * `path[]` と違って異常値を除外しても代わりが立てられないため、ここに該当したら
 * ルート全体を取得失敗として扱う（`toExploreErrorCode` の default 分岐で "unknown" になり、
 * 既存のルート取得エラー表示・再試行導線がそのまま使える）。
 */
class InvalidWalkRouteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWalkRouteError";
  }
}

/**
 * bounds の north_east / south_west のいずれかが不正な場合、既に検証済みの座標群
 * （origin・destination・有効な path 点）から矩形を計算し直して安全側にフォールバックする。
 * bounds 自体が壊れていても NaN の Region を作らないための最終手段。
 */
function computeBoundsFromPoints(points: readonly GeoCoordinates[]): WalkRouteBounds {
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  return {
    northEast: { latitude: Math.max(...latitudes), longitude: Math.max(...longitudes) },
    southWest: { latitude: Math.min(...latitudes), longitude: Math.min(...longitudes) },
  };
}

/**
 * WalkingRouteResponse を画面用 WalkRoute に整形する。表示名はレスポンスではなく引数の name を優先する。
 * backend は destination.name 未指定時に place_id を name として返す仕様のため、
 * 選択したカードの名前（fallbackName）を正とする（place_id が画面に出る事故を避けるため）。
 *
 * 座標の妥当性検証（NaN・非有限値・緯度±90度／経度±180度超え）を行う:
 * - `origin`/`destination.location` が不正なら `InvalidWalkRouteError` を throw する（代替が立てられないため）。
 * - `path[]` は不正な点だけを除外する（折れ線の一部が欠けるだけで済むため、ルート全体は失敗にしない）。
 *   除外の結果2点未満になった場合は空配列にする。`WalkRoutePolyline` は元々 `path.length < 2` を
 *   描画スキップの条件にしているため、この扱いは「ルート線なし」として自然に吸収される。
 * - `bounds` が不正なら、検証済みの座標群から矩形を計算し直してフォールバックする。
 */
export function toWalkRoute(response: WalkingRouteResponse, fallbackName?: string): WalkRoute {
  const origin: GeoCoordinates = {
    latitude: response.origin.latitude,
    longitude: response.origin.longitude,
  };
  const destinationLocation: GeoCoordinates = {
    latitude: response.destination.location.latitude,
    longitude: response.destination.location.longitude,
  };

  if (!isValidCoordinate(origin) || !isValidCoordinate(destinationLocation)) {
    throw new InvalidWalkRouteError(
      "WalkingRouteResponse の origin/destination.location が不正な座標です",
    );
  }

  const validPath = response.path
    .map((point) => ({ latitude: point.latitude, longitude: point.longitude }))
    .filter(isValidCoordinate);
  const path = validPath.length >= 2 ? validPath : [];

  const northEast: GeoCoordinates = {
    latitude: response.bounds.north_east.latitude,
    longitude: response.bounds.north_east.longitude,
  };
  const southWest: GeoCoordinates = {
    latitude: response.bounds.south_west.latitude,
    longitude: response.bounds.south_west.longitude,
  };
  const bounds =
    isValidCoordinate(northEast) && isValidCoordinate(southWest)
      ? { northEast, southWest }
      : computeBoundsFromPoints([origin, destinationLocation, ...validPath]);

  return {
    origin,
    destination: {
      placeId: response.destination.place_id,
      name: fallbackName ?? response.destination.name,
      location: destinationLocation,
    },
    durationSeconds: toNonNegative(response.duration_seconds),
    distanceMeters: toNonNegative(response.distance_meters),
    path,
    bounds,
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
