import { RECORDS_BY_PERIOD, TODAY_INDEX } from "@/features/history/data/records";
import type { Period } from "@/features/history/types";
import { formatDuration } from "@/lib/formatDuration";

export type PeriodChartBar = {
  label: string;
  /** その日/週の合計時間(分)。 */
  value: number;
  /** バーの高さ（%）。最大値に対する比率で、0でも視認できるよう最小2%を確保する。 */
  heightPct: number;
  /** 「今日」に相当するバーかどうか（ハイライト表示用）。 */
  highlight: boolean;
};

export type PeriodChartResult = {
  bars: PeriodChartBar[];
  /** 期間内の合計時間(分)。 */
  totalMinutes: number;
  /** 合計時間の日本語表記（「◯時間◯分」）。 */
  totalWalkLabel: string;
  /** 合計距離の目安(km・小数1桁)。 */
  totalDistKm: number;
};

/**
 * 期間（週/月）ごとの棒グラフ用データを組み立てる純粋関数（mock の `chartBars` 等）。
 */
export function buildPeriodChart(period: Period): PeriodChartResult {
  const records = RECORDS_BY_PERIOD[period];
  const todayIndex = TODAY_INDEX[period];
  const max = Math.max(...records.map(([, minutes]) => minutes), 1);

  const bars: PeriodChartBar[] = records.map(([label, value], index) => ({
    label,
    value,
    heightPct: Math.max((value / max) * 100, 2),
    highlight: index === todayIndex,
  }));

  const totalMinutes = records.reduce((sum, [, minutes]) => sum + minutes, 0);
  const totalDistKm = Math.round(totalMinutes * 0.083 * 10) / 10;

  return {
    bars,
    totalMinutes,
    totalWalkLabel: formatDuration(totalMinutes),
    totalDistKm,
  };
}
