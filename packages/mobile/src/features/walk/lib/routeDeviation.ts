import { distanceMeters } from "@/features/walk/lib/geoDistance";
import { METERS_PER_DEGREE_LATITUDE } from "@/features/walk/lib/mapRegion";
import type { WalkRoute } from "@/features/walk/types";
import { isValidCoordinate } from "@/lib/geoCoordinate";
import type { GeoCoordinates } from "@/services/location/types";

/** 「ルートから外れた」と判定する、折れ線までの最短距離のしきい値（m）。 */
export const ROUTE_DEVIATION_THRESHOLD_METERS = 80;

/**
 * 目的地にこの距離まで近づいたら再計算しない（m）。
 * SS-33 では `lib/walkRouteLeg.ts` の往路/復路ラッチ（目的地に着いたら復路）にも
 * 同じしきい値を流用する。
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

/**
 * 現在地が表示中のルートから外れているか。
 * 判定順:
 * 1. `route.path.length < 2` → false（測る対象が無いルートで自動再計算ループに入らないため）。
 * 2. 目的地から `DESTINATION_NEAR_RADIUS_METERS` 以内 → false（ゴール直前で引き直さない）。
 * 3. 折れ線全体への最短距離が `ROUTE_DEVIATION_THRESHOLD_METERS` を超える → true。
 *
 * 「進行済み区間を除いた残りの折れ線」ではなく **折れ線全体** への距離で判定する。
 * 進捗を持たずに済み、来た道を戻る／近道して合流するケースで無駄な再計算が起きない
 * （トレードオフ: ルート上の別地点の近くを通っている限り再計算されない。MVP では許容）。
 *
 * SS-33（周回ルート）での判定対象: **周回全体の `route.path`** を使う（leg 単位に絞らない）。
 * 理由:
 * - 往路と復路は出発地・目的地の周辺で必ず接近しており、leg 単位に絞ると
 *   「もう一方の leg の上を歩いている」だけで逸脱と判定され、無駄な再計算が増える。
 * - 「進行済み区間を除かない」という初版の設計判断（進捗を持たずに済む／来た道を戻る場合に
 *   再計算しない）と同じ理屈がそのまま当てはまる。
 * トレードオフ: 復路にいるのに往路の折れ線の近くを歩いている間は逸脱と判定されない。
 * 周回である以上「ルート上にいる」ことは事実なので MVP では許容する。
 */
export function isOffRoute(position: GeoCoordinates, route: WalkRoute): boolean {
  if (route.path.length < 2) {
    return false;
  }

  if (distanceMeters(position, route.destination.location) <= DESTINATION_NEAR_RADIUS_METERS) {
    return false;
  }

  const distance = distanceToRoutePath(position, route.path);
  if (distance === null) {
    return false;
  }

  return distance > ROUTE_DEVIATION_THRESHOLD_METERS;
}
