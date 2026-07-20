import { describe, expect, it } from "vitest";

import { toLetterSpacing, toLineHeight, toTextStyle } from "@/theme/adapters/typography";

describe("toLineHeight", () => {
  it("無単位倍率を fontSize 基準の px に丸める", () => {
    expect(toLineHeight(16, "1.55")).toBe(25); // 16 * 1.55 = 24.8 → 25
  });

  it("数値の倍率も受け付ける", () => {
    expect(toLineHeight(16, 1.55)).toBe(25);
  });

  it("px 指定はそのまま数値化して返す", () => {
    expect(toLineHeight(16, "24px")).toBe(24);
  });

  it("解釈できない値は例外", () => {
    expect(() => toLineHeight(16, "auto")).toThrow();
  });
});

describe("toLetterSpacing", () => {
  it("em 指定を fontSize 基準の px に換算する", () => {
    expect(toLetterSpacing(16, "-0.01em")).toBeCloseTo(-0.16);
  });

  it("px 指定はそのまま返す", () => {
    expect(toLetterSpacing(16, "0.5px")).toBe(0.5);
  });

  it("未指定は 0", () => {
    expect(toLetterSpacing(16, undefined)).toBe(0);
  });

  it("0em は 0", () => {
    expect(toLetterSpacing(16, "0em")).toBe(0);
  });

  it("解釈できない値は例外", () => {
    expect(() => toLetterSpacing(16, "wide")).toThrow();
  });
});

describe("toTextStyle", () => {
  const base = { fontSize: 16, lineHeight: "1.55", letterSpacing: "-0.01em", fontWeight: "700" };

  it("fontSize/lineHeight/letterSpacing/fontWeight を変換する", () => {
    const style = toTextStyle(base);
    expect(style).toEqual({
      fontSize: 16,
      lineHeight: 25,
      letterSpacing: -0.16,
      fontWeight: "700",
    });
  });

  it("tabularNums: true で fontVariant が付く", () => {
    const style = toTextStyle(base, { tabularNums: true });
    expect(style.fontVariant).toEqual(["tabular-nums"]);
  });

  it("既定では fontVariant が付かない", () => {
    const style = toTextStyle(base);
    expect(style.fontVariant).toBeUndefined();
  });
});
