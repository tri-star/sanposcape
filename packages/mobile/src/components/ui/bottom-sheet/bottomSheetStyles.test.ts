import { describe, expect, it } from "vitest";

import { resolveBottomSheetAppearance } from "@/components/ui/bottom-sheet/bottomSheetStyles";
import { darkTheme, lightTheme } from "@/theme/tokens";

describe("resolveBottomSheetAppearance", () => {
  it.each([lightTheme, darkTheme])("背景色・角丸・影が定義される", (theme) => {
    const appearance = resolveBottomSheetAppearance(theme);
    expect(appearance.backgroundColor).toBe(theme.colors.surface);
    expect(appearance.borderRadius).toBe(theme.radius.xl);
    expect(appearance.boxShadow).toBe(theme.shadow.sheet);
  });

  it.each([lightTheme, darkTheme])("overlayColor は rgba 形式で不透明度を持つ", (theme) => {
    const appearance = resolveBottomSheetAppearance(theme);
    expect(appearance.overlayColor).toMatch(/^rgba\(\d+, \d+, \d+, 0\.48\)$/);
  });

  it("4px 未満の角丸にならない", () => {
    const appearance = resolveBottomSheetAppearance(lightTheme);
    expect(appearance.borderRadius).toBeGreaterThanOrEqual(4);
  });
});
