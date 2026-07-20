import { describe, expect, it } from "vitest";

import { hexToRgba } from "@/lib/hexToRgba";

describe("hexToRgba", () => {
  it("6桁の16進コードを rgba に変換する", () => {
    expect(hexToRgba("#1b2430", 0.5)).toBe("rgba(27, 36, 48, 0.5)");
  });

  it("3桁の16進コードを rgba に変換する", () => {
    expect(hexToRgba("#fff", 1)).toBe("rgba(255, 255, 255, 1)");
  });

  it("alpha が 0 でも変換できる", () => {
    expect(hexToRgba("#000000", 0)).toBe("rgba(0, 0, 0, 0)");
  });

  it("16進コードでない値は例外", () => {
    expect(() => hexToRgba("rgb(0,0,0)", 0.5)).toThrow();
    expect(() => hexToRgba("1b2430", 0.5)).toThrow();
  });

  it("alpha が範囲外(0未満/1超)は例外", () => {
    expect(() => hexToRgba("#1b2430", -0.1)).toThrow();
    expect(() => hexToRgba("#1b2430", 1.1)).toThrow();
  });
});
