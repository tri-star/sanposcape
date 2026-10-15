import { describe, expect, it } from "vitest";

import { toAverageSpeedKmh } from "@/features/history/lib/walkMetrics";

describe("toAverageSpeedKmh", () => {
  it("30分/2.5km → 5.0km/h", () => {
    expect(toAverageSpeedKmh(1800, 2500)).toBe(5);
  });

  it("小数1桁に四捨五入する", () => {
    // 3600秒/4250m → 4.25km/h → 4.3km/h
    expect(toAverageSpeedKmh(3600, 4250)).toBe(4.3);
    // 3600秒/4240m → 4.24km/h → 4.2km/h
    expect(toAverageSpeedKmh(3600, 4240)).toBe(4.2);
  });

  it("距離0なら算出不能（null）", () => {
    expect(toAverageSpeedKmh(1800, 0)).toBeNull();
  });

  it("時間0なら算出不能（null）", () => {
    expect(toAverageSpeedKmh(0, 2500)).toBeNull();
  });

  it("NaN・Infinity・負値なら算出不能（null）", () => {
    expect(toAverageSpeedKmh(Number.NaN, 2500)).toBeNull();
    expect(toAverageSpeedKmh(1800, Number.NaN)).toBeNull();
    expect(toAverageSpeedKmh(Number.POSITIVE_INFINITY, 2500)).toBeNull();
    expect(toAverageSpeedKmh(1800, Number.POSITIVE_INFINITY)).toBeNull();
    expect(toAverageSpeedKmh(-1800, 2500)).toBeNull();
    expect(toAverageSpeedKmh(1800, -2500)).toBeNull();
  });

  it("とても遅い記録も算出不能にせず値を返す（旧ペース表示の99分/km上限は設けない）", () => {
    // 0.1kmを6000秒（約100分/km）かけた想定 → 0.06km/h → 0.1km/h
    expect(toAverageSpeedKmh(6000, 100)).toBe(0.1);
  });

  it("distanceMeters は表示用に丸めた km ではなく生の値で計算する（丸め誤差の回帰検知）", () => {
    // 2143m/1920秒: 表示用に丸めた2.1kmで計算すると3.9km/h（約2%ズレ）になってしまうが、
    // 生の2143mで計算すると4.0km/hになるはず。
    expect(toAverageSpeedKmh(1920, 2143)).toBe(4);
  });
});
