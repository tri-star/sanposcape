import { describe, expect, it } from "vitest";

import {
  formatWalkDate,
  formatWalkTime,
  formatWalkTimeRange,
  parseIsoDate,
} from "@/features/history/lib/walkDateLabel";

describe("parseIsoDate", () => {
  it("正常なISO文字列をDateにする", () => {
    const date = parseIsoDate("2026-08-02T14:30:00.000Z");
    expect(date).not.toBeNull();
    expect(date?.getTime()).toBe(new Date("2026-08-02T14:30:00.000Z").getTime());
  });

  it("不正な文字列はnullを返す", () => {
    expect(parseIsoDate("nope")).toBeNull();
  });

  it("空文字はnullを返す", () => {
    expect(parseIsoDate("")).toBeNull();
  });
});

describe("formatWalkDate", () => {
  // タイムゾーン非依存にするため、Dateはローカルのコンストラクタで組み立てる。
  it("同じ年なら「8月2日(日)」形式（年を出さない）", () => {
    const date = new Date(2026, 7, 2, 14, 30);
    const now = new Date(2026, 7, 3);
    expect(formatWalkDate(date, now)).toBe("8月2日(日)");
  });

  it("年が異なるなら「2025年8月2日(土)」のように年を前置する", () => {
    const date = new Date(2025, 7, 2, 14, 30);
    const now = new Date(2026, 7, 3);
    expect(formatWalkDate(date, now)).toBe("2025年8月2日(土)");
  });

  it("now を省略すると既定でDate.now()の年と比較する", () => {
    const now = new Date();
    const date = new Date(now.getFullYear(), 0, 1);
    expect(formatWalkDate(date)).not.toContain("年");
  });
});

describe("formatWalkTime", () => {
  it("1桁の時・分をゼロ埋めする（9:05 → 09:05）", () => {
    const date = new Date(2026, 7, 2, 9, 5);
    expect(formatWalkTime(date)).toBe("09:05");
  });

  it("2桁の時・分はそのまま", () => {
    const date = new Date(2026, 7, 2, 14, 30);
    expect(formatWalkTime(date)).toBe("14:30");
  });
});

describe("formatWalkTimeRange", () => {
  it("開始と終了を en dash で区切る", () => {
    const start = new Date(2026, 7, 2, 14, 30);
    const end = new Date(2026, 7, 2, 15, 2);
    expect(formatWalkTimeRange(start, end)).toBe("14:30 – 15:02");
  });
});
