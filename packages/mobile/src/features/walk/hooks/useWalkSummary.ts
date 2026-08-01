import { SAMPLE_WALK_SUMMARY_STATS } from "@/features/walk/data/defaults";
import { useWalkSave } from "@/features/walk/hooks/useWalkSave";
import { toWalkSummaryStats } from "@/features/walk/lib/finishedWalk";
import type { WalkSaveErrorCode } from "@/features/walk/lib/walkSaveError";
import { useFinishedWalkStore } from "@/features/walk/store/useFinishedWalkStore";
import type { WalkSaveStatus, WalkSummaryStats } from "@/features/walk/types";

export type UseWalkSummaryResult = {
  stats: WalkSummaryStats;
  /** ドラフトが無い（deep link・画面カタログ直叩き）場合 true。 */
  isSample: boolean;
  saveStatus: WalkSaveStatus;
  saveErrorCode: WalkSaveErrorCode | null;
  retrySave: () => void;
};

/**
 * サマリ画面が必要とするものを1つに束ねる合成 hook（`useActiveWalk` と同じ役割）。
 * `useFinishedWalkStore` からドラフトを読み、`useWalkSave` に保存を委譲する。
 */
export function useWalkSummary(): UseWalkSummaryResult {
  const finishedWalk = useFinishedWalkStore((state) => state.finishedWalk);
  const save = useWalkSave(finishedWalk);

  const stats =
    finishedWalk !== null ? toWalkSummaryStats(finishedWalk) : SAMPLE_WALK_SUMMARY_STATS;

  return {
    stats,
    isSample: finishedWalk === null,
    saveStatus: save.status,
    saveErrorCode: save.errorCode,
    retrySave: save.retry,
  };
}
