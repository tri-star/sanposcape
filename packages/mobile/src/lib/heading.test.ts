import { describe, expect, it } from "vitest";

import { normalizeHeadingDegrees, quantizeHeadingDegrees } from "@/lib/heading";

describe("normalizeHeadingDegrees", () => {
  it("[0, 360) の値はそのまま返す", () => {
    expect(normalizeHeadingDegrees(0)).toBe(0);
    expect(normalizeHeadingDegrees(123.5)).toBe(123.5);
    expect(normalizeHeadingDegrees(359.9)).toBe(359.9);
  });

  it("範囲外の値を [0, 360) に回す", () => {
    expect(normalizeHeadingDegrees(360)).toBe(0);
    expect(normalizeHeadingDegrees(370)).toBe(10);
    expect(normalizeHeadingDegrees(-10)).toBe(350);
    expect(normalizeHeadingDegrees(-360)).toBe(0);
  });

  it("-0 は 0 にする", () => {
    expect(Object.is(normalizeHeadingDegrees(-0), 0)).toBe(true);
  });

  it("NaN・Infinity は null", () => {
    expect(normalizeHeadingDegrees(Number.NaN)).toBeNull();
    expect(normalizeHeadingDegrees(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("quantizeHeadingDegrees", () => {
  it("刻みに丸める", () => {
    expect(quantizeHeadingDegrees(12.4, 5)).toBe(10);
    expect(quantizeHeadingDegrees(12.6, 5)).toBe(15);
  });

  it("360 付近は 0 に回す", () => {
    expect(quantizeHeadingDegrees(358, 5)).toBe(0);
  });

  it("刻みが 0 以下・不正なら正規化だけする", () => {
    expect(quantizeHeadingDegrees(-10, 0)).toBe(350);
    expect(quantizeHeadingDegrees(12.4, Number.NaN)).toBe(12.4);
  });

  it("NaN は null", () => {
    expect(quantizeHeadingDegrees(Number.NaN, 5)).toBeNull();
  });
});
