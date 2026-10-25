import { describe, expect, it } from "vitest";

import { walkReturnLineStyle } from "@/features/walk/lib/walkReturnLineStyle";

describe("walkReturnLineStyle", () => {
  it("iOS: 見せたい値（太さ 5・[1, 9]）を MapKit の拡大率 2.5 で割って渡す", () => {
    // 実装の定数を import せず、仕様の値を手で書く。
    const style = walkReturnLineStyle("ios");
    expect(style.strokeWidth).toBeCloseTo(2);
    expect(style.dashPattern).toHaveLength(2);
    expect(style.dashPattern[0]).toBeCloseTo(0.4);
    expect(style.dashPattern[1]).toBeCloseTo(3.6);
  });

  it("iOS: 拡大された後の太さが往路の実線（5）と同じになる", () => {
    expect(walkReturnLineStyle("ios").strokeWidth * 2.5).toBeCloseTo(5);
  });

  it.each(["android", "web"])("%s: 往路と同じ太さ 5・破線 [12, 8] のまま", (platformOs) => {
    expect(walkReturnLineStyle(platformOs)).toEqual({ strokeWidth: 5, dashPattern: [12, 8] });
  });

  it("呼び出し側が配列を書き換えても、次の呼び出しに影響しない", () => {
    walkReturnLineStyle("android").dashPattern.push(99);
    expect(walkReturnLineStyle("android").dashPattern).toEqual([12, 8]);
  });
});
