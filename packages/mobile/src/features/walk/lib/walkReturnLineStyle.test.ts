import { describe, expect, it } from "vitest";

import { walkReturnLineStyle } from "@/features/walk/lib/walkReturnLineStyle";

describe("walkReturnLineStyle", () => {
  it("Apple Maps: 見せたい値（太さ 5・[1, 9]）を MapKit の拡大率 2.5 で割って渡す", () => {
    // 実装の定数を import せず、仕様の値を手で書く。
    const style = walkReturnLineStyle("apple");
    expect(style.strokeWidth).toBeCloseTo(2);
    expect(style.dashPattern).toHaveLength(2);
    expect(style.dashPattern[0]).toBeCloseTo(0.4);
    expect(style.dashPattern[1]).toBeCloseTo(3.6);
  });

  it("Apple Maps: 拡大された後の太さが往路の実線（5）と同じになる", () => {
    expect(walkReturnLineStyle("apple").strokeWidth * 2.5).toBeCloseTo(5);
  });

  it("Google Maps（Android・SS-267 以降の iOS）: 往路と同じ太さ 5・破線 [12, 8] のまま", () => {
    expect(walkReturnLineStyle("google")).toEqual({ strokeWidth: 5, dashPattern: [12, 8] });
  });

  it("呼び出し側が配列を書き換えても、次の呼び出しに影響しない", () => {
    walkReturnLineStyle("google").dashPattern.push(99);
    expect(walkReturnLineStyle("google").dashPattern).toEqual([12, 8]);
  });
});
