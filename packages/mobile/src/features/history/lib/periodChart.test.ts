import { describe, expect, it } from "vitest";

import type { WalkStatsBucketRead, WalkStatsPeriodRead } from "@/api/generated/model";
import { buildPeriodChart } from "@/features/history/lib/periodChart";

function bucket(overrides: Partial<WalkStatsBucketRead>): WalkStatsBucketRead {
  return {
    start_date: "2026-08-03",
    end_date: "2026-08-03",
    walk_count: 0,
    duration_seconds: 0,
    distance_meters: 0,
    is_current: false,
    ...overrides,
  };
}

const WEEK_STATS: WalkStatsPeriodRead = {
  start_date: "2026-08-03",
  end_date: "2026-08-09",
  total_walk_count: 6,
  // バケット合計 (32+0+48+26+55+72+41=274分=16440秒) ≠ total(16560秒=276分) にして、
  // バケット合算ではなく total を使っていることを検証する。
  total_duration_seconds: 16560,
  total_distance_meters: 22743,
  buckets: [
    bucket({ start_date: "2026-08-03", duration_seconds: 32 * 60 }),
    bucket({ start_date: "2026-08-04", duration_seconds: 0 }),
    bucket({ start_date: "2026-08-05", duration_seconds: 48 * 60 }),
    bucket({ start_date: "2026-08-06", duration_seconds: 26 * 60 }),
    bucket({ start_date: "2026-08-07", duration_seconds: 55 * 60 }),
    bucket({ start_date: "2026-08-08", duration_seconds: 72 * 60 }),
    bucket({ start_date: "2026-08-09", duration_seconds: 41 * 60, is_current: true }),
  ],
};

const MONTH_STATS: WalkStatsPeriodRead = {
  start_date: "2026-07-13",
  end_date: "2026-08-09",
  total_walk_count: 21,
  total_duration_seconds: 885 * 60,
  total_distance_meters: 73500,
  buckets: [
    bucket({ start_date: "2026-07-13", duration_seconds: 185 * 60 }),
    bucket({ start_date: "2026-07-20", duration_seconds: 240 * 60 }),
    bucket({ start_date: "2026-07-27", duration_seconds: 162 * 60 }),
    bucket({ start_date: "2026-08-03", duration_seconds: 298 * 60, is_current: true }),
  ],
};

describe("buildPeriodChart", () => {
  it("week: 曜日ラベルが月〜日の順になる", () => {
    const result = buildPeriodChart("week", WEEK_STATS);
    expect(result.bars.map((b) => b.label)).toEqual(["月", "火", "水", "木", "金", "土", "日"]);
  });

  it("week: 最大値のバーが100%、0分のバーが最小2%", () => {
    const result = buildPeriodChart("week", WEEK_STATS);
    // 最大値(72分)は6番目(index 5)のバケット。
    expect(result.bars[5]?.heightPct).toBe(100);
    expect(result.bars[1]?.value).toBe(0);
    expect(result.bars[1]?.heightPct).toBe(2);
  });

  it("week: is_current のバケットだけ highlight になる", () => {
    const result = buildPeriodChart("week", WEEK_STATS);
    expect(result.bars.map((b) => b.highlight)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it("week: totalWalkLabel は total_duration_seconds から求まる（バケット合計ではない）", () => {
    const result = buildPeriodChart("week", WEEK_STATS);
    expect(result.totalMinutes).toBe(276);
    expect(result.totalWalkLabel).toBe("4時間36分");
  });

  it("week: totalDistKm は total_distance_meters / 1000 の小数1桁", () => {
    const result = buildPeriodChart("week", WEEK_STATS);
    expect(result.totalDistKm).toBeCloseTo(22.7);
  });

  it("week: key がバケットの start_date になっている", () => {
    const result = buildPeriodChart("week", WEEK_STATS);
    expect(result.bars.map((b) => b.key)).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
    ]);
  });

  it("month: 4バケットで「第1週」〜「第4週」ラベルになる", () => {
    const result = buildPeriodChart("month", MONTH_STATS);
    expect(result.bars).toHaveLength(4);
    expect(result.bars.map((b) => b.label)).toEqual(["第1週", "第2週", "第3週", "第4週"]);
    expect(result.bars[3]?.heightPct).toBe(100);
    expect(result.bars.map((b) => b.highlight)).toEqual([false, false, false, true]);
  });

  it("month: バケット数が5でも5本のバーになる（ハードコードしていないことの検証）", () => {
    const fiveBucketStats: WalkStatsPeriodRead = {
      ...MONTH_STATS,
      buckets: [
        ...MONTH_STATS.buckets,
        bucket({ start_date: "2026-08-10", duration_seconds: 60 * 60 }),
      ],
    };
    const result = buildPeriodChart("month", fiveBucketStats);
    expect(result.bars).toHaveLength(5);
    expect(result.bars.map((b) => b.label)).toEqual(["第1週", "第2週", "第3週", "第4週", "第5週"]);
  });

  it("空: buckets: [] かつ全 total 0 の場合、例外を投げず全て0になる", () => {
    const emptyStats: WalkStatsPeriodRead = {
      start_date: "2026-08-03",
      end_date: "2026-08-09",
      total_walk_count: 0,
      total_duration_seconds: 0,
      total_distance_meters: 0,
      buckets: [],
    };
    const result = buildPeriodChart("week", emptyStats);
    expect(result.bars).toEqual([]);
    expect(result.totalMinutes).toBe(0);
    expect(result.totalDistKm).toBe(0);
  });

  it("全バケット0分でもゼロ除算せず、全バーが最小2%になる", () => {
    const zeroStats: WalkStatsPeriodRead = {
      start_date: "2026-08-03",
      end_date: "2026-08-09",
      total_walk_count: 0,
      total_duration_seconds: 0,
      total_distance_meters: 0,
      buckets: [
        bucket({ start_date: "2026-08-03" }),
        bucket({ start_date: "2026-08-04" }),
        bucket({ start_date: "2026-08-05" }),
      ],
    };
    const result = buildPeriodChart("week", zeroStats);
    expect(result.bars.every((b) => b.heightPct === 2)).toBe(true);
  });
});
