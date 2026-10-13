import { isValidCoordinate } from "@/lib/geoCoordinate";
import type { GeoCoordinates } from "@/services/location/types";

/** 扇形の半径（画面上の px）。現在地ピン（高さ約 44px）の頭より外へ出る長さにする。 */
export const HEADING_BEAM_RADIUS_PX = 64;
/** 扇形の開き（度）。向いている方向を中心に左右へ半分ずつ開く。 */
export const HEADING_BEAM_SPREAD_DEGREES = 70;
/** 円弧を折れ線で近似するときの1区間の角度（度）。 */
const ARC_STEP_DEGREES = 7;
/** 緯度 1 度あたりの距離（m）。地図の表示範囲から 1px あたりの距離を見積もるのに使う。 */
const METERS_PER_DEGREE_LATITUDE = 111_320;
const EARTH_RADIUS_METERS = 6_371_008.8;
/** 半径の下限・上限（m）。表示範囲の値が壊れていても極端な図形を描かない。 */
const MIN_RADIUS_METERS = 3;
const MAX_RADIUS_METERS = 3000;
/** 極付近で cos(緯度) がゼロに潰れて経度のずれが発散するのを防ぐ。 */
const MIN_COS_LATITUDE = 1e-6;

/**
 * 扇形の半径（m）を、地図の表示範囲（緯度方向の幅）と地図の高さ（px）から求める（SS-169）。
 * 扇形は地図上の図形（`Polygon`）として描くので、画面上でおおよそ `HEADING_BEAM_RADIUS_PX` に
 * 見えるよう、ズームが確定するたびに距離へ換算し直す。求められなければ null。
 */
export function headingBeamRadiusMeters(input: {
  latitudeDelta: number;
  mapHeightPx: number;
}): number | null {
  const { latitudeDelta, mapHeightPx } = input;
  if (!Number.isFinite(latitudeDelta) || latitudeDelta <= 0) return null;
  if (!Number.isFinite(mapHeightPx) || mapHeightPx <= 0) return null;
  const metersPerPx = (latitudeDelta * METERS_PER_DEGREE_LATITUDE) / mapHeightPx;
  return Math.min(
    MAX_RADIUS_METERS,
    Math.max(MIN_RADIUS_METERS, HEADING_BEAM_RADIUS_PX * metersPerPx),
  );
}

/**
 * 現在地を頂点に、向いている方向（北を 0 とした時計回りの度数）へ開いた扇形の頂点列（SS-169）。
 * 先頭が `center`、続いて円弧を左端から右端へ並べる（`Polygon` は自動で閉じる）。
 * 数十〜数百 m の図形なので、等距円筒近似で十分。座標が不正なら空配列。
 */
export function headingBeamPolygon(input: {
  center: GeoCoordinates;
  headingDegrees: number;
  radiusMeters: number;
}): GeoCoordinates[] {
  const { center, headingDegrees, radiusMeters } = input;
  if (!isValidCoordinate(center)) return [];
  if (!Number.isFinite(headingDegrees) || !Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    return [];
  }
  const steps = Math.ceil(HEADING_BEAM_SPREAD_DEGREES / ARC_STEP_DEGREES);
  const startDegrees = headingDegrees - HEADING_BEAM_SPREAD_DEGREES / 2;
  const points: GeoCoordinates[] = [center];
  for (let i = 0; i <= steps; i += 1) {
    const bearing = startDegrees + (HEADING_BEAM_SPREAD_DEGREES * i) / steps;
    points.push(offsetByBearing(center, bearing, radiusMeters));
  }
  return points;
}

function offsetByBearing(
  origin: GeoCoordinates,
  bearingDegrees: number,
  distanceMeters: number,
): GeoCoordinates {
  const bearing = (bearingDegrees * Math.PI) / 180;
  const north = distanceMeters * Math.cos(bearing);
  const east = distanceMeters * Math.sin(bearing);
  const cosLatitude = Math.max(Math.cos((origin.latitude * Math.PI) / 180), MIN_COS_LATITUDE);
  const latitude = origin.latitude + ((north / EARTH_RADIUS_METERS) * 180) / Math.PI;
  const longitude =
    origin.longitude + ((east / (EARTH_RADIUS_METERS * cosLatitude)) * 180) / Math.PI;
  return {
    latitude: Math.max(-90, Math.min(90, latitude)),
    longitude: Math.max(-180, Math.min(180, longitude)),
  };
}
