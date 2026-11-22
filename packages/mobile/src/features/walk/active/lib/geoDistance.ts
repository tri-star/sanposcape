import type { GeoCoordinates } from "@/services/location/types";

/** 地球の半径（m）。 */
export const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function isFiniteCoordinate(point: GeoCoordinates): boolean {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

/**
 * 2点間の大円距離（m）を Haversine で求める純粋関数。
 * GPS の異常値（非有限値）が来た場合は 0 を返し、累積距離が NaN にならないようにする。
 */
export function distanceMeters(a: GeoCoordinates, b: GeoCoordinates): number {
  if (!isFiniteCoordinate(a) || !isFiniteCoordinate(b)) {
    return 0;
  }

  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLng = toRadians(b.longitude - a.longitude);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_METERS * c;
}
