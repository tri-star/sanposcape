import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { fetchWalkStats } from "@/features/history/api/walkStatsApi";
import { STUB_USER_PROFILE } from "@/features/history/data/profile";
import { STUB_DAILY_STEP_GOAL } from "@/features/history/data/stepGoal";
import {
  EMPTY_PERIOD_CHART,
  buildPeriodChart,
  type PeriodChartResult,
} from "@/features/history/lib/periodChart";
import { estimateSteps } from "@/features/history/lib/stepEstimate";
import {
  toWalkStatsErrorCode,
  type WalkStatsErrorCode,
} from "@/features/history/lib/walkStatsError";
import type { Period } from "@/features/history/types";

/** サーバー状態の鮮度（30秒。`queryClient` の既定と同値。意図を明示するために書く）。 */
const STALE_TIME_MS = 30_000;
const GC_TIME_MS = 5 * 60_000;

export type UseHistorySummaryResult = {
  userName: string;
  period: Period;
  setPeriod: (period: Period) => void;
  chart: PeriodChartResult;
  /** 連続日数。未取得時は 0。 */
  streakDays: number;
  /** 今日の推定歩数（距離からの換算）。未取得時は 0。 */
  todaySteps: number;
  /** 目標歩数（スタブ定数）。 */
  stepGoal: number;
  /** 初回取得中（まだ何も表示できない）。 */
  isLoading: boolean;
  errorCode: WalkStatsErrorCode | null;
  /** 再試行（エラーカードのボタンから呼ぶ）。 */
  reload: () => void;
};

/**
 * 記録画面が表示するデータを1本化する hook。
 * `data/`（stub）・`api/`（サーバー状態）を読むのはこの hook のみで、View は戻り値だけを参照する。
 *
 * `queryKey` は `["walks", "stats"]`（`["walks", ...]` 始まり）にする。`useWalkSave` が
 * 保存成功時に `invalidateQueries({ queryKey: ["walks"] })` を呼ぶため、これで
 * 「散歩を保存 → 記録タブに戻ると集計が更新されている」が自動的に成立する。
 *
 * `hooks/` 層は Vitest 対象外（`react-native` に到達しうる）。テストしたいロジックは
 * すべて `lib/`（`buildPeriodChart` / `estimateSteps` / `toWalkStatsErrorCode`）へ
 * 切り出してあるので、hook には配線しか残さない。
 */
export function useHistorySummary(): UseHistorySummaryResult {
  const [period, setPeriod] = useState<Period>("week");
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["walks", "stats"] as const, []);

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchWalkStats({ signal }),
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    retry: false,
  });

  const chart = useMemo(() => {
    const stats = query.data;
    if (!stats) return EMPTY_PERIOD_CHART;
    return buildPeriodChart(period, period === "week" ? stats.week : stats.month);
  }, [query.data, period]);

  const reload = useCallback(() => {
    void queryClient.resetQueries({ queryKey });
  }, [queryClient, queryKey]);

  return {
    userName: STUB_USER_PROFILE.displayName,
    period,
    setPeriod,
    chart,
    streakDays: query.data?.streak_days ?? 0,
    todaySteps: query.data ? estimateSteps(query.data.today.distance_meters) : 0,
    stepGoal: STUB_DAILY_STEP_GOAL,
    isLoading: query.isPending,
    errorCode: query.error ? toWalkStatsErrorCode(query.error) : null,
    reload,
  };
}
