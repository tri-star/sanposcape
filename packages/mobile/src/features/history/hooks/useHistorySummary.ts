import { useState } from "react";

import { STUB_USER_PROFILE } from "@/features/history/data/profile";
import { STEP_GOAL, STREAK_DAYS, TODAY_STEPS } from "@/features/history/data/records";
import { buildPeriodChart, type PeriodChartResult } from "@/features/history/lib/periodChart";
import type { Period } from "@/features/history/types";

export type UseHistorySummaryResult = {
  userName: string;
  period: Period;
  setPeriod: (period: Period) => void;
  chart: PeriodChartResult;
  streakDays: number;
  todaySteps: number;
  stepGoal: number;
};

/**
 * 記録画面が表示するデータを1本化する hook。
 * `data/`（stub）を直接読むのはこの hook のみで、View は戻り値だけを参照する。
 * 将来 `features/history/api/`（Orval + TanStack Query）に差し替える際は、
 * この hook の内部実装だけを変更すればよい（`useWalkPlan` と同じ設計思想）。
 */
export function useHistorySummary(): UseHistorySummaryResult {
  const [period, setPeriod] = useState<Period>("week");
  const chart = buildPeriodChart(period);

  return {
    userName: STUB_USER_PROFILE.displayName,
    period,
    setPeriod,
    chart,
    streakDays: STREAK_DAYS,
    todaySteps: TODAY_STEPS,
    stepGoal: STEP_GOAL,
  };
}
