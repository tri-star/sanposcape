import type { PlaceCandidate } from "@/api/generated/model";
import { toNonNegative } from "@/features/walk/lib/numberGuard";
import type { SpotCandidate } from "@/features/walk/types";

/** 秒 → 分（四捨五入。0秒でも最低1分にはしない＝0を許容）。 */
export function toRoundTripMinutes(seconds: number): number {
  return Math.round(toNonNegative(seconds) / 60);
}

/** メートル → km（小数1桁に丸める）。 */
export function toRoundTripKm(meters: number): number {
  return Math.round(toNonNegative(meters) / 100) / 10;
}

/** API の PlaceCandidate を画面用の SpotCandidate に整形する。 */
export function toSpotCandidate(candidate: PlaceCandidate): SpotCandidate {
  return {
    id: candidate.id,
    name: candidate.name,
    category: candidate.category,
    location: {
      latitude: candidate.location.latitude,
      longitude: candidate.location.longitude,
    },
    roundTripMinutes: toRoundTripMinutes(candidate.round_trip_duration_seconds),
    roundTripKm: toRoundTripKm(candidate.round_trip_distance_meters),
  };
}

/** レスポンス全体を整形する（backend が往復時間昇順でソート済みのため並べ替えはしない）。 */
export function toSpotCandidates(candidates: readonly PlaceCandidate[]): SpotCandidate[] {
  return candidates.map(toSpotCandidate);
}
