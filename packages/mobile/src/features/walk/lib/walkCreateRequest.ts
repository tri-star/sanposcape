import type { WalkCreate } from "@/api/generated/model";
import { toTrackPayload } from "@/features/walk/lib/walkTrackPayload";
import {
  DESTINATION_NAME_MAX_LENGTH,
  truncateUnicodeCodePoints,
} from "@/features/walk/lib/unicodeText";
import type { FinishedWalk } from "@/features/walk/types";

/** backend の定数と同値（schemas.py）。 */
export const MAX_WALK_DURATION_SECONDS = 86_400;
/** backend の定数と同値（schemas.py）。 */
export const MAX_DISTANCE_METERS = 200_000;
export { DESTINATION_NAME_MAX_LENGTH } from "@/features/walk/lib/unicodeText";

/** destination.name が空のときのフォールバック（`finishedWalk.ts` の表示用フォールバックと揃える）。 */
const FALLBACK_DESTINATION_NAME = "目的地";

/**
 * `FinishedWalk` を `WalkCreate`（POST /walks の送信ボディ）に変換する。
 * 保存できない条件では `null` を返す（既存 `buildWalkingRouteRequest` / `buildPlaceSearchRequest`
 * と同じ「送れないなら null」規約。ネットワークに出す前に保存不能と判定する）。
 *
 * null を返す条件:
 * - `endedAtMs <= startedAtMs`
 * - wall-clock（`endedAtMs - startedAtMs`）が `MAX_WALK_DURATION_SECONDS` を超える
 * - `destination.placeId.trim()` が空文字
 *
 * `distance_meters` は上限クランプのみ行い、異常値でも保存自体は成功させる
 * （距離のグリッチ1つで散歩の記録全体を落とさない）。
 */
export function buildWalkCreateRequest(finished: FinishedWalk): WalkCreate | null {
  const { startedAtMs, endedAtMs, destination } = finished;

  if (endedAtMs <= startedAtMs) {
    return null;
  }

  const wallClockDurationMs = endedAtMs - startedAtMs;
  if (wallClockDurationMs > MAX_WALK_DURATION_SECONDS * 1000) {
    return null;
  }

  const placeId = destination.placeId.trim();
  if (placeId.length === 0) {
    return null;
  }

  const name = destination.name.trim();

  return {
    client_walk_id: finished.clientWalkId,
    started_at: new Date(startedAtMs).toISOString(),
    ended_at: new Date(endedAtMs).toISOString(),
    duration_seconds: finished.elapsedSec,
    // 異常値でも保存自体は成功させるため、上限にクランプする（記録全体を落とさない）。
    distance_meters: Math.min(finished.distanceMeters, MAX_DISTANCE_METERS),
    destination: {
      place_id: placeId,
      name: truncateUnicodeCodePoints(
        name.length === 0 ? FALLBACK_DESTINATION_NAME : name,
        DESTINATION_NAME_MAX_LENGTH,
      ),
      // destination.location は /explore/places 由来で安定しているため丸めない（walkRouteRequest.ts と同じ判断）。
      location: {
        latitude: destination.location.latitude,
        longitude: destination.location.longitude,
      },
    },
    track: toTrackPayload(finished.track),
  };
}
