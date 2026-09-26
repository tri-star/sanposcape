import type { WalkDetailRead } from "@/api/generated/model";
import { formatPace } from "@/features/history/lib/walkMetrics";
import type { WalkDetail } from "@/features/history/types";
import { formatDateLabel, formatTimeRangeLabel, parseIsoDate } from "@/lib/dateLabel";
import { formatClock } from "@/lib/formatClock";
import { isValidCoordinate } from "@/lib/geoCoordinate";
import { toNonNegative } from "@/lib/numberGuard";
import { toKilometers } from "@/lib/units";

/** 目的地名が空文字のときのフォールバック表示。 */
const FALLBACK_DESTINATION_NAME = "目的地";

/** `WalkDetailRead` を履歴詳細（`WalkDetail`）に整形する。 */
export function toWalkDetail(read: WalkDetailRead, now: Date = new Date()): WalkDetail {
  const startedAt = parseIsoDate(read.started_at);
  const endedAt = parseIsoDate(read.ended_at);
  const destinationName = read.destination.name.trim();

  return {
    id: read.id,
    startedAt: read.started_at,
    dateLabel: startedAt !== null ? formatDateLabel(startedAt, now) : "日時不明",
    timeRangeLabel:
      startedAt !== null && endedAt !== null ? formatTimeRangeLabel(startedAt, endedAt) : "",
    destinationName: destinationName.length > 0 ? destinationName : FALLBACK_DESTINATION_NAME,
    destination: {
      latitude: read.destination.location.latitude,
      longitude: read.destination.location.longitude,
    },
    elapsedLabel: formatClock(Math.floor(toNonNegative(read.duration_seconds))),
    distanceKm: toKilometers(read.distance_meters),
    paceLabel: formatPace(read.duration_seconds, read.distance_meters),
    track: read.track
      .map((point) => ({ latitude: point.latitude, longitude: point.longitude }))
      .filter(isValidCoordinate),
  };
}
