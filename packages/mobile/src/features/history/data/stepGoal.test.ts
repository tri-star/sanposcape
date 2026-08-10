import { describe, expect, it } from "vitest";

import { STUB_DAILY_STEP_GOAL } from "@/features/history/data/stepGoal";

describe("STUB_DAILY_STEP_GOAL", () => {
  it("正の整数である", () => {
    expect(Number.isInteger(STUB_DAILY_STEP_GOAL)).toBe(true);
    expect(STUB_DAILY_STEP_GOAL).toBeGreaterThan(0);
  });

  it("現実的な値域内（1000〜50000）。桁を打ち間違えた編集をCIで検知する", () => {
    expect(STUB_DAILY_STEP_GOAL).toBeGreaterThanOrEqual(1000);
    expect(STUB_DAILY_STEP_GOAL).toBeLessThanOrEqual(50000);
  });
});
