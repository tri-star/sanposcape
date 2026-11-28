import { distanceMeters } from "@/features/walk/active/lib/geoDistance";
import { roundCoordinate } from "@/features/walk/explore/lib/placeSearchRequest";
import type { GeoCoordinates } from "@/services/location/types";

/**
 * 散歩の目的地にできる、現在地からの直線距離の上限（m。SS-286）。これ以上離れた目的地では周回ルートを要求しない。
 * backend の `/explore/routes/loop` も同じ値で 422 を返す（`maps/schemas.py` の `MAX_ROUTE_STRAIGHT_DISTANCE_METERS`）。
 * スポットの候補は `/explore/places` が現在地から 2km の円に絞るので、実際に当たるのはピンを目的地にしたとき。
 */
export const MAX_DESTINATION_DISTANCE_METERS = 10_000;

/**
 * 目的地が現在地から上限（`MAX_DESTINATION_DISTANCE_METERS`）以上離れているか。
 * 現在地は周回ルートの要求に送る値（小数4桁に丸めたもの。`buildWalkingRouteRequest`）で測り、backend の判定と境界を揃える。
 * 候補一覧にピンを混ぜるとき（SS-285）も、この関数で一覧から外す。
 */
export function isDestinationOutOfRange(
  origin: GeoCoordinates,
  destination: GeoCoordinates,
): boolean {
  const requestOrigin: GeoCoordinates = {
    latitude: roundCoordinate(origin.latitude),
    longitude: roundCoordinate(origin.longitude),
  };
  return distanceMeters(requestOrigin, destination) >= MAX_DESTINATION_DISTANCE_METERS;
}
