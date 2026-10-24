import { describe, expect, it } from "vitest";

import { mixHex } from "@/theme/mixHex";

describe("mixHex", () => {
  it("color を ratio の割合で base に混ぜる", () => {
    expect(mixHex("#0e8fc7", "#ffffff", 0.16)).toBe("#d8edf6");
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("ratio 0 は base、1 は color（小文字で返す）", () => {
    expect(mixHex("#E6484D", "#FFFFFF", 0)).toBe("#ffffff");
    expect(mixHex("#E6484D", "#FFFFFF", 1)).toBe("#e6484d");
  });

  it("ratio は 0〜1 にクランプする", () => {
    expect(mixHex("#e6484d", "#ffffff", -1)).toBe("#ffffff");
    expect(mixHex("#e6484d", "#ffffff", 2)).toBe("#e6484d");
  });

  it.each([
    ["#fff", "#ffffff"],
    ["#e6484d", "white"],
    ["rgb(0,0,0)", "#ffffff"],
  ])("形式が違う (%s, %s) は color をそのまま返す", (color, base) => {
    expect(mixHex(color, base, 0.5)).toBe(color);
  });
});
