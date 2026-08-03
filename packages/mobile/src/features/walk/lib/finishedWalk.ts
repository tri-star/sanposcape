import { estimateStepsFromMeters } from "@/features/walk/lib/walkStats";
import type { ActiveWalk, FinishedWalk, WalkSummaryStats } from "@/features/walk/types";
import { toNonNegative } from "@/lib/numberGuard";
import { toKilometers } from "@/lib/units";
import type { GeoCoordinates } from "@/services/location/types";

/** ゴール名が空文字のときのフォールバック表示。 */
const FALLBACK_GOAL_NAME = "目的地";

/** 即終了時（endedAtMs と startedAtMs が同値以下）に確保する最小の経過（ms）。 */
const MIN_DURATION_MS = 1000;

/**
 * 散歩終了時のドラフトを組み立てる純粋関数。
 *
 * - `endedAtMs` は `startedAtMs + 1000` 以上にクランプする
 *   （backend は `ended_at > started_at` を要求するため、即終了時の同値を避ける）。
 * - `elapsedSec` は非有限値・負値を 0 に丸め、整数化したうえで wall-clock 秒を超えないようにクランプする
 *   （backend の 300 秒スキュー許容に頼らない）。
 * - `distanceMeters` は非有限値・負値を 0 に丸め四捨五入する。
 * - `track` は `points` を配列コピーする（元の state を後から書き換えられても影響しないように）。
 */
export function buildFinishedWalk(input: {
  activeWalk: ActiveWalk;
  /** 一時停止を除いた実活動秒。 */
  elapsedSec: number;
  distanceMeters: number;
  points: readonly GeoCoordinates[];
  /** 終了時刻（呼び出し側が Date.now() を渡す＝純粋に保つ）。 */
  endedAtMs: number;
}): FinishedWalk {
  const { activeWalk, points } = input;

  const endedAtMs = Math.max(input.endedAtMs, activeWalk.startedAtMs + MIN_DURATION_MS);
  const wallClockSec = Math.floor((endedAtMs - activeWalk.startedAtMs) / 1000);
  const elapsedSec = Math.min(Math.floor(toNonNegative(input.elapsedSec)), wallClockSec);
  const distanceMeters = Math.round(toNonNegative(input.distanceMeters));

  return {
    clientWalkId: activeWalk.clientWalkId,
    startedAtMs: activeWalk.startedAtMs,
    endedAtMs,
    elapsedSec,
    distanceMeters,
    destination: activeWalk.destination,
    track: [...points],
  };
}

/** `FinishedWalk` からサマリ画面の表示値を導出する。 */
export function toWalkSummaryStats(finished: FinishedWalk): WalkSummaryStats {
  const goalName = finished.destination.name.trim();
  return {
    elapsedSec: finished.elapsedSec,
    distanceKm: toKilometers(finished.distanceMeters),
    steps: estimateStepsFromMeters(finished.distanceMeters),
    goalName: goalName.length > 0 ? goalName : FALLBACK_GOAL_NAME,
  };
}
