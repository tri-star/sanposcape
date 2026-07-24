import { describe, expect, it } from "vitest";

import { STUB_USER_PROFILE } from "@/features/history/data/profile";
import {
  MONTH_RECORDS,
  RECORDS_BY_PERIOD,
  STEP_GOAL,
  STREAK_DAYS,
  TODAY_INDEX,
  TODAY_STEPS,
  WEEK_RECORDS,
} from "@/features/history/data/records";

describe("WEEK_RECORDS / MONTH_RECORDS", () => {
  it("WEEK_RECORDS は7件（曜日分）", () => {
    expect(WEEK_RECORDS).toHaveLength(7);
  });

  it("MONTH_RECORDS は非空", () => {
    expect(MONTH_RECORDS.length).toBeGreaterThan(0);
  });

  it("全レコードの minutes は 0 以上", () => {
    for (const [, minutes] of [...WEEK_RECORDS, ...MONTH_RECORDS]) {
      expect(minutes).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("TODAY_INDEX", () => {
  it("week は WEEK_RECORDS の範囲内", () => {
    expect(TODAY_INDEX.week).toBeGreaterThanOrEqual(0);
    expect(TODAY_INDEX.week).toBeLessThan(WEEK_RECORDS.length);
  });

  it("month は MONTH_RECORDS の範囲内", () => {
    expect(TODAY_INDEX.month).toBeGreaterThanOrEqual(0);
    expect(TODAY_INDEX.month).toBeLessThan(MONTH_RECORDS.length);
  });
});

describe("RECORDS_BY_PERIOD", () => {
  it("week/month がそれぞれ WEEK_RECORDS/MONTH_RECORDS と一致する", () => {
    expect(RECORDS_BY_PERIOD.week).toBe(WEEK_RECORDS);
    expect(RECORDS_BY_PERIOD.month).toBe(MONTH_RECORDS);
  });
});

describe("歩数/連続日数の既定値", () => {
  it("TODAY_STEPS/STEP_GOAL/STREAK_DAYS は正の値", () => {
    expect(TODAY_STEPS).toBeGreaterThan(0);
    expect(STEP_GOAL).toBeGreaterThan(0);
    expect(STREAK_DAYS).toBeGreaterThan(0);
  });

  it("TODAY_STEPS は STEP_GOAL を超えない（進捗バーが100%を超えない現実値）", () => {
    expect(TODAY_STEPS).toBeLessThanOrEqual(STEP_GOAL);
  });
});

describe("STUB_USER_PROFILE", () => {
  it("displayName は非空文字列", () => {
    expect(STUB_USER_PROFILE.displayName.length).toBeGreaterThan(0);
  });
});
