import type { PlaceCandidate } from "@/api/generated/model";
import type { SpotCandidate } from "@/features/walk/types";
import { toNonNegative } from "@/lib/numberGuard";
import {
  DESTINATION_NAME_MAX_LENGTH,
  truncateUnicodeCodePoints,
} from "@/features/walk/lib/unicodeText";

const FALLBACK_SPOT_NAME = "目的地";

/** 秒 → 分（四捨五入。0秒でも最低1分にはしない＝0を許容）。 */
export function toRoundTripMinutes(seconds: number): number {
  return Math.round(toNonNegative(seconds) / 60);
}

/** メートル → km（小数1桁に丸める）。 */
export function toRoundTripKm(meters: number): number {
  return Math.round(toNonNegative(meters) / 100) / 10;
}

/**
 * API の表示名を UI 用の非空文字列に正規化する。
 *
 * 通常は backend が日本語優先かつ非空の名称を返すが、古い backend や実行時の契約逸脱でも
 * 空表示や Place ID の露出を防ぐため、ここを最終防衛の境界とする。
 */
export function resolveSpotDisplayName(value: unknown): string {
  if (typeof value !== "string") return FALLBACK_SPOT_NAME;

  const trimmed = value.trim();
  if (trimmed.length === 0) return FALLBACK_SPOT_NAME;

  return truncateUnicodeCodePoints(trimmed, DESTINATION_NAME_MAX_LENGTH);
}

/** API の PlaceCandidate を画面用の SpotCandidate に整形する。 */
export function toSpotCandidate(candidate: PlaceCandidate): SpotCandidate {
  return {
    id: candidate.id,
    name: resolveSpotDisplayName(candidate.name),
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
