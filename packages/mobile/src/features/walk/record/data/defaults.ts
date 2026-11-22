import { DEFAULT_ACTIVE_WALK, DEFAULT_WALK_GOAL } from "@/features/walk/active/data/defaults";
import type { FinishedWalk, WalkSummaryStats } from "@/features/walk/record/types";

/**
 * サマリ画面を単独表示（画面カタログ等）した時の代表的なスタブ結果。
 * mock / デザインギャラリーの StatBlock 例値（00:28:34 / 2.1km / 3,240歩）と揃えている。
 */
export const SAMPLE_WALK_RESULT = {
  elapsedSec: 1714, // 00:28:34 相当
  distKm: "2.1",
  steps: 3240,
  goalName: DEFAULT_WALK_GOAL.name,
} as const;

/**
 * サマリ画面のフォールバック表示値（`SAMPLE_WALK_RESULT` を `WalkSummaryStats` の形へ揃えたもの）。
 * `useWalkSummary` がドラフト無し（deep link・画面カタログ直叩き）のときに使う。
 */
export const SAMPLE_WALK_SUMMARY_STATS = {
  elapsedSec: SAMPLE_WALK_RESULT.elapsedSec,
  distanceKm: Number(SAMPLE_WALK_RESULT.distKm),
  steps: SAMPLE_WALK_RESULT.steps,
  goalName: SAMPLE_WALK_RESULT.goalName,
} as const satisfies WalkSummaryStats;

/**
 * 画面カタログから散歩サマリを単独表示するときに store へ入れる代表値。
 * 呼び出し側が Date.now() と randomUuidV4() を渡す（この関数自体は純粋に保つ）。
 * これを積んで /walk-summary を開くと **実際に POST /walks が走る**ため、
 * 屋外に出ずに保存経路と SS-20 の履歴反映を手元で確認できる。
 */
export function buildSampleFinishedWalk(input: {
  nowMs: number;
  clientWalkId: string;
}): FinishedWalk {
  const { nowMs, clientWalkId } = input;
  const startedAtMs = nowMs - SAMPLE_WALK_RESULT.elapsedSec * 1000;
  const origin = DEFAULT_ACTIVE_WALK.origin;
  const destination = DEFAULT_ACTIVE_WALK.destination;

  // origin → destination を結ぶ4点の直線補間（表示・送信整形の確認に足りる程度で十分）。
  const steps = 3;
  const track = Array.from({ length: steps + 1 }, (_, i) => {
    const ratio = i / steps;
    return {
      latitude: origin.latitude + (destination.location.latitude - origin.latitude) * ratio,
      longitude: origin.longitude + (destination.location.longitude - origin.longitude) * ratio,
    };
  });

  return {
    clientWalkId,
    startedAtMs,
    endedAtMs: nowMs,
    elapsedSec: SAMPLE_WALK_RESULT.elapsedSec,
    distanceMeters: Number(SAMPLE_WALK_RESULT.distKm) * 1000,
    destination,
    track,
  };
}
