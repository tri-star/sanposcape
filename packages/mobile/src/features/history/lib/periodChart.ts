import type { WalkStatsPeriodRead } from "@/api/generated/model";
import { weekBucketLabel, weekdayLabelFromIsoDate } from "@/features/history/lib/periodChartLabel";
import type { Period } from "@/features/history/types";
import { formatDuration } from "@/lib/formatDuration";
import { toKilometers } from "@/lib/units";

export type PeriodChartBar = {
  /** React の key に使う安定した識別子（バケットの start_date）。 */
  key: string;
  label: string;
  /** その日/週の合計時間(分)。 */
  value: number;
  /** バーの高さ（%）。最大値に対する比率で、0でも視認できるよう最小2%を確保する。 */
  heightPct: number;
  /** 「今日」を含むバーかどうか（ハイライト表示用。サーバーの is_current をそのまま使う）。 */
  highlight: boolean;
};

export type PeriodChartResult = {
  bars: PeriodChartBar[];
  /** 期間内の合計時間(分)。 */
  totalMinutes: number;
  /** 合計時間の日本語表記（「◯時間◯分」）。 */
  totalWalkLabel: string;
  /** 期間内の合計距離(km・小数1桁)。サーバー集計の distance_meters を換算した実値。 */
  totalDistKm: number;
};

/** データ未取得時に `PeriodChart` へ渡す空のチャート。 */
export const EMPTY_PERIOD_CHART: PeriodChartResult = {
  bars: [],
  totalMinutes: 0,
  totalWalkLabel: formatDuration(0),
  totalDistKm: 0,
};

/**
 * 期間（週/月）ごとの棒グラフ用データを組み立てる純粋関数。
 * `GET /walks/stats` が返す `WalkStatsPeriodRead`（week or month）を入力とし、
 * バケット数をハードコードせず `stats.buckets` をそのまま map する
 * （将来 backend がバケット数を変えても mobile は無改修で動く）。
 */
export function buildPeriodChart(period: Period, stats: WalkStatsPeriodRead): PeriodChartResult {
  const values = stats.buckets.map((bucket) => Math.round(bucket.duration_seconds / 60));
  const max = Math.max(...values, 1);

  const bars: PeriodChartBar[] = stats.buckets.map((bucket, index) => {
    const value = values[index] ?? 0;
    return {
      key: bucket.start_date,
      label:
        period === "week" ? weekdayLabelFromIsoDate(bucket.start_date) : weekBucketLabel(index),
      value,
      heightPct: Math.max((value / max) * 100, 2),
      highlight: bucket.is_current,
    };
  });

  // バケットごとに丸めてから足すと合計がズレるため、サーバーの total_duration_seconds を使う。
  const totalMinutes = Math.round(stats.total_duration_seconds / 60);
  const totalDistKm = toKilometers(stats.total_distance_meters);

  return {
    bars,
    totalMinutes,
    totalWalkLabel: formatDuration(totalMinutes),
    totalDistKm,
  };
}
