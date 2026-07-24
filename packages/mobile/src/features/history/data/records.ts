import type { Period } from "@/features/history/types";

/** 曜日/週ラベルと合計時間(分)のペア。mock の `week` / `month` を静的に移植。 */
export type PeriodRecord = readonly [label: string, minutes: number];

export const WEEK_RECORDS: readonly PeriodRecord[] = [
  ["月", 32],
  ["火", 0],
  ["水", 48],
  ["木", 26],
  ["金", 55],
  ["土", 72],
  ["日", 41],
];

export const MONTH_RECORDS: readonly PeriodRecord[] = [
  ["第1週", 185],
  ["第2週", 240],
  ["第3週", 162],
  ["第4週", 298],
];

/** 各期間で「今日」に相当するインデックス（ハイライト対象）。mock の `todayIdx`。 */
export const TODAY_INDEX: Record<Period, number> = {
  week: 6,
  month: 3,
};

export const RECORDS_BY_PERIOD: Record<Period, readonly PeriodRecord[]> = {
  week: WEEK_RECORDS,
  month: MONTH_RECORDS,
};

/** 連続日数（mock の `streak`、静的値）。 */
export const STREAK_DAYS = 12;

/** 今日の歩数（mock の `todaySteps`、静的値）。 */
export const TODAY_STEPS = 6240;

/** 今日の目標歩数（mock の「/ 8,000歩」）。 */
export const STEP_GOAL = 8000;
