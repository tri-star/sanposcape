import { describe, expect, it } from "vitest";

import { withAlpha } from "@/theme/withAlpha";

describe("withAlpha", () => {
  it("16%相当のアルファを付与する", () => {
    expect(withAlpha("#1585fe", 0.16)).toBe("#1585fe29");
  });

  it("0%は00、100%はffになる", () => {
    expect(withAlpha("#1585fe", 0)).toBe("#1585fe00");
    expect(withAlpha("#1585fe", 1)).toBe("#1585feff");
  });

  it("範囲外の opacity は 0〜1 にクランプする", () => {
    expect(withAlpha("#1585fe", -1)).toBe("#1585fe00");
    expect(withAlpha("#1585fe", 2)).toBe("#1585feff");
  });

  it("#RRGGBB 形式でない文字列はそのまま返す", () => {
    expect(withAlpha("rgba(0,0,0,0.5)", 0.5)).toBe("rgba(0,0,0,0.5)");
    expect(withAlpha("notacolor", 0.5)).toBe("notacolor");
  });
});
