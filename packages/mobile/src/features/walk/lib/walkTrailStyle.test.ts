import { describe, expect, it } from "vitest";

import { walkTrailStyle } from "@/features/walk/lib/walkTrailStyle";
import { darkTheme, lightTheme } from "@/theme/tokens";

describe("walkTrailStyle", () => {
  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ])("%s: アクセント色を半透明にした色で、ルート線と別の色", (_label, theme) => {
    const { color } = walkTrailStyle(theme);
    expect(color).toMatch(new RegExp(`^${theme.colors.accent}[0-9a-f]{2}$`));
    expect(color.slice(0, 7)).not.toBe(theme.map.route);
    expect(color.slice(0, 7)).not.toBe(theme.map.routeReturn);
  });

  it("ルート線（5px）より細い", () => {
    expect(walkTrailStyle(lightTheme).strokeWidth).toBeLessThan(5);
  });
});
