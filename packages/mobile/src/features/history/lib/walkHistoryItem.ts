import type { WalkRead } from "@/api/generated/model";
import { formatWalkDate, formatWalkTime, parseIsoDate } from "@/features/history/lib/walkDateLabel";
import type { WalkHistoryItem } from "@/features/history/types";
import { formatDuration } from "@/lib/formatDuration";
import { toNonNegative } from "@/lib/numberGuard";
import { toKilometers } from "@/lib/units";

/** 目的地名が空文字のときのフォールバック表示（`finishedWalk.ts` の FALLBACK_GOAL_NAME と同じ扱い）。 */
const FALLBACK_DESTINATION_NAME = "目的地";

/** `WalkRead` を履歴一覧の1件（`WalkHistoryItem`）に整形する。 */
export function toWalkHistoryItem(read: WalkRead, now: Date = new Date()): WalkHistoryItem {
  const startedAt = parseIsoDate(read.started_at);
  const destinationName = read.destination.name.trim();

  return {
    id: read.id,
    startedAt: read.started_at,
    dateLabel: startedAt !== null ? formatWalkDate(startedAt, now) : "日時不明",
    timeLabel: startedAt !== null ? formatWalkTime(startedAt) : "",
    destinationName: destinationName.length > 0 ? destinationName : FALLBACK_DESTINATION_NAME,
    durationLabel: formatDuration(Math.round(toNonNegative(read.duration_seconds) / 60)),
    distanceKm: toKilometers(read.distance_meters),
  };
}

/** レスポンス全体を整形する（backend が `started_at DESC` でソート済みのため並べ替えはしない）。 */
export function toWalkHistoryItems(
  reads: readonly WalkRead[],
  now: Date = new Date(),
): WalkHistoryItem[] {
  return reads.map((read) => toWalkHistoryItem(read, now));
}

/**
 * ページ跨ぎの重複（取得中に新しい散歩が先頭に入ると起きうる）を id で除去する。先勝ち・順序維持。
 */
export function dedupeWalkHistoryItems(items: readonly WalkHistoryItem[]): WalkHistoryItem[] {
  const seen = new Set<string>();
  const result: WalkHistoryItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}
