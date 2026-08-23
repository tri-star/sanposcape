import { METERS_PER_DEGREE_LATITUDE } from "@/features/walk/lib/mapRegion";
import { isValidCoordinate } from "@/lib/geoCoordinate";
import type { GeoCoordinates } from "@/services/location/types";

/**
 * 「目的地に着いた」とみなす半径（m）。
 * `lib/walkRouteLeg.ts` の往路/復路ラッチ（目的地に着いたら復路）が使う。
 *
 * SS-35 では「目的地に近いので再計算しない」という自動再計算の抑制条件でもあったが、
 * SS-33 で自動再計算を廃止したためその用途は無くなった。
 */
export const DESTINATION_NEAR_RADIUS_METERS = 50;

type LocalPoint = { x: number; y: number };

/**
 * `origin` を原点とした局所平面（equirectangular）座標に変換する。
 * 数百m〜数kmのスケールでは誤差0.1%未満で、Haversineを線分ごとに解くより単純。
 */
function toLocalPoint(origin: GeoCoordinates, point: GeoCoordinates): LocalPoint {
  const cosLatitude = Math.cos((origin.latitude * Math.PI) / 180);
  return {
    x: (point.longitude - origin.longitude) * METERS_PER_DEGREE_LATITUDE * cosLatitude,
    y: (point.latitude - origin.latitude) * METERS_PER_DEGREE_LATITUDE,
  };
}

/**
 * 局所平面上で、原点(0,0)から線分 A-B までの最短距離。
 * `t = clamp(dot(AP, AB) / |AB|^2, 0, 1)` で射影点を求め、その点との距離を返す。
 * `|AB|^2 === 0`（A と B が同一点）のときは A との距離にフォールバックする（0除算回避）。
 */
function distanceFromOriginToSegment(a: LocalPoint, b: LocalPoint): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSquared = abx * abx + aby * aby;

  if (lengthSquared === 0) {
    return Math.hypot(a.x, a.y);
  }

  // AP = origin - A = (-a.x, -a.y)
  const t = Math.min(1, Math.max(0, (-a.x * abx + -a.y * aby) / lengthSquared));
  const projX = a.x + t * abx;
  const projY = a.y + t * aby;
  return Math.hypot(projX, projY);
}

/**
 * 点から折れ線までの最短距離（m）。
 * `path` が空（不正座標の除外後を含む）なら null、1点なら その点との距離。
 * 不正座標（`isValidCoordinate` が false）の頂点は無視する。
 * 頂点ではなく **線分** への距離を使う。Routes の折れ線は数十m刻みの頂点があり、
 * 頂点最短だと直線区間の中ほどで距離を過大評価するため。
 */
export function distanceToRoutePath(
  point: GeoCoordinates,
  path: readonly GeoCoordinates[],
): number | null {
  const validPath = path.filter(isValidCoordinate);

  if (validPath.length === 0) {
    return null;
  }

  if (validPath.length === 1) {
    const local = toLocalPoint(point, validPath[0]!);
    return Math.hypot(local.x, local.y);
  }

  const localPath = validPath.map((vertex) => toLocalPoint(point, vertex));

  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < localPath.length - 1; i += 1) {
    const segmentDistance = distanceFromOriginToSegment(localPath[i]!, localPath[i + 1]!);
    if (segmentDistance < minDistance) {
      minDistance = segmentDistance;
    }
  }
  return minDistance;
}
