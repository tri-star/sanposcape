import { describe, expect, it } from "vitest";

import { parseCubicBezier, toBoxShadow, toDurationMs } from "@/theme/adapters/effects";

describe("parseCubicBezier", () => {
  it("スペースなしの小数(.2 形式)を解釈する", () => {
    expect(parseCubicBezier("cubic-bezier(.2,.8,.2,1)")).toEqual([0.2, 0.8, 0.2, 1]);
  });

  it("0.2 形式・スペースありも解釈する", () => {
    expect(parseCubicBezier("cubic-bezier(0.34, 1.4, 0.5, 1)")).toEqual([0.34, 1.4, 0.5, 1]);
  });

  it("cubic-bezier 形式でなければ例外", () => {
    expect(() => parseCubicBezier("ease-in-out")).toThrow();
  });

  it("引数が4個でなければ例外", () => {
    expect(() => parseCubicBezier("cubic-bezier(0.2, 0.8, 0.2)")).toThrow();
  });
});

describe("toDurationMs", () => {
  it("ms 単位をそのまま数値化する", () => {
    expect(toDurationMs("320ms")).toBe(320);
  });

  it("s 単位を ms に変換する", () => {
    expect(toDurationMs("0.32s")).toBeCloseTo(320);
  });

  it("単位なしは例外", () => {
    expect(() => toDurationMs("320")).toThrow();
  });
});

describe("toBoxShadow", () => {
  it("正常な box-shadow はそのまま返す", () => {
    const shadow = "0 6px 18px rgba(27, 36, 48, 0.10)";
    expect(toBoxShadow(shadow)).toBe(shadow);
  });

  it("none は例外", () => {
    expect(() => toBoxShadow("none")).toThrow();
  });

  it("空文字は例外", () => {
    expect(() => toBoxShadow("")).toThrow();
  });
});
