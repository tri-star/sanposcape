import { describe, expect, it } from "vitest";

import { formatPace } from "@/features/history/lib/walkMetrics";

describe("formatPace", () => {
  it("30分/2.5km → 12'00\"/km", () => {
    expect(formatPace(1800, 2500)).toBe("12'00\"/km");
  });

  it("秒の繰り上がり（59.6秒 → 分が繰り上がる）", () => {
    // 119.6秒/km → 1分59.6秒/km → 四捨五入で2分00秒/kmに繰り上がる
    expect(formatPace(119.6, 1000)).toBe("2'00\"/km");
  });

  it("距離0なら「—」", () => {
    expect(formatPace(1800, 0)).toBe("—");
  });

  it("時間0なら「—」", () => {
    expect(formatPace(0, 2500)).toBe("—");
  });

  it("NaNなら「—」", () => {
    expect(formatPace(Number.NaN, 2500)).toBe("—");
    expect(formatPace(1800, Number.NaN)).toBe("—");
  });

  it("異常に遅い値（GPSが飛んだ記録）は「—」", () => {
    // 0.1kmを6000秒（約100分/km）かけた想定 → 上限(99分/km)を超えるため算出不能扱い
    expect(formatPace(6000, 100)).toBe("—");
  });
});
