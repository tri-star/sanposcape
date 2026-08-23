import { SAMPLE_WALK_SUMMARY_STATS } from "@/features/walk/data/defaults";
import { useWalkSave } from "@/features/walk/hooks/useWalkSave";
import { toWalkSummaryStats } from "@/features/walk/lib/finishedWalk";
import type { WalkSaveErrorCode } from "@/features/walk/lib/walkSaveError";
import { useFinishedWalkStore } from "@/features/walk/store/useFinishedWalkStore";
import type { WalkSaveStatus, WalkSummaryStats } from "@/features/walk/types";

export type UseWalkSummaryOptions = {
  /** 認証済みか。`app/walk-summary.tsx` が `useAuthSessionStore` から注入する（ADR-009 決定8）。 */
  isSignedIn: boolean;
};

export type UseWalkSummaryResult = {
  stats: WalkSummaryStats;
  /** ドラフトが無い（deep link・画面カタログ直叩き）場合 true。 */
  isSample: boolean;
  saveStatus: WalkSaveStatus;
  saveErrorCode: WalkSaveErrorCode | null;
  retrySave: () => void;
  /** 保存成功時のサーバー側 walk id。「記録を見る」からその散歩の詳細へ遷移するために使う（SS-20）。 */
  savedWalkId: string | null;
};

/**
 * サマリ画面が必要とするものを1つに束ねる合成 hook（`useActiveWalk` と同じ役割）。
 * `useFinishedWalkStore` からドラフトを読み、`useWalkSave` に保存を委譲する。
 */
export function useWalkSummary({ isSignedIn }: UseWalkSummaryOptions): UseWalkSummaryResult {
  const finishedWalk = useFinishedWalkStore((state) => state.finishedWalk);
  const savedWalkId = useFinishedWalkStore((state) => state.savedWalkId);
  const save = useWalkSave(finishedWalk, { isSignedIn });

  const stats =
    finishedWalk !== null ? toWalkSummaryStats(finishedWalk) : SAMPLE_WALK_SUMMARY_STATS;

  return {
    stats,
    isSample: finishedWalk === null,
    saveStatus: save.status,
    saveErrorCode: save.errorCode,
    retrySave: save.retry,
    savedWalkId,
  };
}
