import { describe, expect, it } from "vitest";

import { resolveSnapTarget, toAbsoluteSnapPoints } from "@/components/ui/bottom-sheet/snapPoints";

describe("toAbsoluteSnapPoints", () => {
  it("比率を画面高に対する px に変換する", () => {
    expect(toAbsoluteSnapPoints([0.5], 800)).toEqual([400]);
  });

  it("未ソート入力を昇順に整列する", () => {
    expect(toAbsoluteSnapPoints([0.9, 0.5], 800)).toEqual([400, 720]);
  });

  it("0以下の比率で例外", () => {
    expect(() => toAbsoluteSnapPoints([0, 0.5], 800)).toThrow();
    expect(() => toAbsoluteSnapPoints([-0.1], 800)).toThrow();
  });

  it("1を超える比率で例外", () => {
    expect(() => toAbsoluteSnapPoints([1.1], 800)).toThrow();
  });

  it("空配列で例外", () => {
    expect(() => toAbsoluteSnapPoints([], 800)).toThrow();
  });

  it("1 は許容される(全画面)", () => {
    expect(toAbsoluteSnapPoints([1], 800)).toEqual([800]);
  });
});

describe("resolveSnapTarget", () => {
  const snapPointsPx = toAbsoluteSnapPoints([0.5, 0.9], 800); // [400, 720]

  it("速度ゼロで最近傍のスナップ点へ", () => {
    expect(resolveSnapTarget(420, 0, snapPointsPx, 100)).toEqual({ type: "snap", y: 400 });
    expect(resolveSnapTarget(650, 0, snapPointsPx, 100)).toEqual({ type: "snap", y: 720 });
  });

  it("下向きの大きな速度で dismiss する(最上部にいても)", () => {
    expect(resolveSnapTarget(720, 900, snapPointsPx, 100)).toEqual({ type: "dismiss" });
  });

  it("上向きの大きな速度で最も開いたスナップ点へ", () => {
    expect(resolveSnapTarget(400, -900, snapPointsPx, 100)).toEqual({ type: "snap", y: 720 });
  });

  it("dismissThreshold 未満まで引き下げたら dismiss する", () => {
    expect(resolveSnapTarget(50, 0, snapPointsPx, 100)).toEqual({ type: "dismiss" });
  });

  it("ちょうど dismissThreshold の場合は dismiss しない", () => {
    expect(resolveSnapTarget(100, 0, snapPointsPx, 100)).toEqual({ type: "snap", y: 400 });
  });

  it("snapPointsPx が空なら例外", () => {
    expect(() => resolveSnapTarget(100, 0, [], 100)).toThrow();
  });
});
