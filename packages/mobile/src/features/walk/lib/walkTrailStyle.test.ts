import { describe, expect, it } from "vitest";

import { walkTrailStyle } from "@/features/walk/lib/walkTrailStyle";
import { darkTheme, lightTheme } from "@/theme/tokens";

describe("walkTrailStyle", () => {
  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ])("%s: アクセント色を半透明にした色で、ルート線と別の色", (_label, theme) => {
    const { color } = walkTrailStyle(theme);
    // 不透明度 0.7（0.7 × 255 = 178.5 → 179 = 0xb3）。実装の定数を import せず、仕様の値を手で書く。
    expect(color).toBe(`${theme.colors.accent}b3`);
    expect(color.slice(0, 7)).not.toBe(theme.map.route);
    expect(color.slice(0, 7)).not.toBe(theme.map.routeReturn);
  });

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ])("%s: 太さは 4px（ルート線の 5px より細い）", (_label, theme) => {
    expect(walkTrailStyle(theme).strokeWidth).toBe(4);
  });
});
