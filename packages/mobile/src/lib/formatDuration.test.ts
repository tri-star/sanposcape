import { describe, expect, it } from "vitest";

import { formatDuration } from "@/lib/formatDuration";

describe("formatDuration", () => {
  it("分のみ", () => {
    expect(formatDuration(30)).toBe("30分");
  });

  it("時間のみ", () => {
    expect(formatDuration(120)).toBe("2時間");
  });

  it("時間と分", () => {
    expect(formatDuration(95)).toBe("1時間35分");
  });

  it("0分", () => {
    expect(formatDuration(0)).toBe("0分");
  });

  it("負の値は例外", () => {
    expect(() => formatDuration(-1)).toThrow();
  });
});
