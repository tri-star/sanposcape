import { describe, expect, it } from "vitest";

import { buildPeriodChart } from "@/features/history/lib/periodChart";

describe("buildPeriodChart", () => {
  it("week: バーの高さ・ハイライト位置・合計を算出する", () => {
    const result = buildPeriodChart("week");

    expect(result.bars).toHaveLength(7);
    expect(result.bars.map((b) => b.label)).toEqual(["月", "火", "水", "木", "金", "土", "日"]);
    // 最大値(72)のバーは100%
    expect(result.bars[5]?.heightPct).toBe(100);
    // 0分のバーも視認できるよう最小2%を確保する
    expect(result.bars[1]?.value).toBe(0);
    expect(result.bars[1]?.heightPct).toBe(2);
    // 「今日」は末尾（日）
    expect(result.bars.map((b) => b.highlight)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);

    expect(result.totalMinutes).toBe(274);
    expect(result.totalWalkLabel).toBe("4時間34分");
    expect(result.totalDistKm).toBeCloseTo(22.7);
  });

  it("month: バーの高さ・ハイライト位置・合計を算出する", () => {
    const result = buildPeriodChart("month");

    expect(result.bars).toHaveLength(4);
    expect(result.bars.map((b) => b.label)).toEqual(["第1週", "第2週", "第3週", "第4週"]);
    expect(result.bars[3]?.heightPct).toBe(100);
    expect(result.bars.map((b) => b.highlight)).toEqual([false, false, false, true]);

    expect(result.totalMinutes).toBe(885);
    expect(result.totalWalkLabel).toBe("14時間45分");
    expect(result.totalDistKm).toBeCloseTo(73.5);
  });
});
