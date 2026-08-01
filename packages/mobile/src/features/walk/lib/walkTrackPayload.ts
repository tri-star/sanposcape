import type { GeoPoint } from "@/api/generated/model";
import { isValidCoordinate } from "@/features/walk/lib/geoCoordinate";
import { roundCoordinate } from "@/features/walk/lib/placeSearchRequest";
import type { GeoCoordinates } from "@/services/location/types";

/** backend の MAX_TRACK_POINTS と同値（schemas.py）。 */
export const MAX_TRACK_POINTS = 10_000;
/** backend が JSONB へ保存する精度（ADR-003 D2。約0.11m、GPS精度より十分細かい）。 */
export const TRACK_COORDINATE_DIGITS = 6;

/**
 * 生の軌跡を API 送信用 `GeoPoint[]` に整形する純粋関数。
 *
 * 1. 無効座標（NaN/Infinity、緯度±90度・経度±180度超え）を除外する。
 * 2. 小数6桁に丸める（backend の保存精度に合わせる。文字列化サイズも縮む）。
 * 3. 丸め後に直前の点と完全一致した点を落とす（一時停止からの再開直後など）。
 * 4. 上限を超える場合のみ、先頭・末尾を必ず保持した等間隔サンプリングで間引く。
 *
 * 記録中の間引き（10m/3秒 + 5m フィルタ、`walkTrack.ts`）は既に十分なため、
 * ここでの上限超過は通常の散歩では起こらない想定（10km 歩いても約1,000点）。
 */
export function toTrackPayload(
  points: readonly GeoCoordinates[],
  maxPoints: number = MAX_TRACK_POINTS,
): GeoPoint[] {
  const rounded: GeoPoint[] = [];
  for (const point of points) {
    if (!isValidCoordinate(point)) continue;

    const candidate: GeoPoint = {
      latitude: roundCoordinate(point.latitude, TRACK_COORDINATE_DIGITS),
      longitude: roundCoordinate(point.longitude, TRACK_COORDINATE_DIGITS),
    };

    const previous = rounded[rounded.length - 1];
    if (
      previous !== undefined &&
      previous.latitude === candidate.latitude &&
      previous.longitude === candidate.longitude
    ) {
      continue;
    }

    rounded.push(candidate);
  }

  if (rounded.length <= maxPoints) {
    return rounded;
  }

  return downsample(rounded, maxPoints);
}

/**
 * 等間隔サンプリングで `max` 点まで間引く。先頭・末尾を必ず保持し、
 * `step = (len - 1) / (max - 1)` で `Math.round(i * step)` のインデックスを採る
 * （採ったインデックスが重複したら詰める）。
 */
function downsample(points: readonly GeoPoint[], max: number): GeoPoint[] {
  if (max <= 1) {
    const first = points[0];
    return first !== undefined ? [first] : [];
  }

  const step = (points.length - 1) / (max - 1);
  const result: GeoPoint[] = [];
  let lastIndex = -1;
  for (let i = 0; i < max; i += 1) {
    const index = Math.round(i * step);
    if (index === lastIndex) continue;
    const point = points[index];
    if (point === undefined) continue;
    result.push(point);
    lastIndex = index;
  }
  return result;
}
