import { describe, expect, it } from "vitest";

import { weekBucketLabel, weekdayLabelFromIsoDate } from "@/features/history/lib/periodChartLabel";

describe("weekdayLabelFromIsoDate", () => {
  it("2026-08-03（月曜）→ 月", () => {
    expect(weekdayLabelFromIsoDate("2026-08-03")).toBe("月");
  });

  it("2026-08-09（日曜）→ 日", () => {
    expect(weekdayLabelFromIsoDate("2026-08-09")).toBe("日");
  });

  it("2026-08-01（土曜、UTC深夜パースだと1日ずれる日付）→ 土", () => {
    // new Date("2026-08-01") をローカルTZでgetDay()すると、UTC以西のTZでは
    // 前日（金曜）にずれる。Date.UTC + getUTCDayを使っていることを間接的に守る。
    expect(weekdayLabelFromIsoDate("2026-08-01")).toBe("土");
  });

  it.each(["", "2026-13-45", "August 3", "2026/08/03", "2026-08-3", "2027-02-29"])(
    "不正な入力 %s は空文字",
    (input) => {
      expect(weekdayLabelFromIsoDate(input)).toBe("");
    },
  );

  it("2028-02-29（うるう年に実在するうるう日）→ 火", () => {
    expect(weekdayLabelFromIsoDate("2028-02-29")).toBe("火");
  });
});

describe("weekBucketLabel", () => {
  it("index 0 → 第1週", () => {
    expect(weekBucketLabel(0)).toBe("第1週");
  });

  it("index 3 → 第4週", () => {
    expect(weekBucketLabel(3)).toBe("第4週");
  });
});
