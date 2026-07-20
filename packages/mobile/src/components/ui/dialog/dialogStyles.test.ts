import { describe, expect, it } from "vitest";

import { resolveDialogAppearance } from "@/components/ui/dialog/dialogStyles";
import { darkTheme, lightTheme } from "@/theme/tokens";

describe("resolveDialogAppearance", () => {
  it.each([lightTheme, darkTheme])("背景色・文字色が定義される", (theme) => {
    const appearance = resolveDialogAppearance(theme);
    expect(appearance.backgroundColor).toBe(theme.colors.surface);
    expect(appearance.titleColor).toBe(theme.colors.text);
    expect(appearance.messageColor).toBe(theme.colors.textMuted);
  });

  it.each([lightTheme, darkTheme])("overlayColor は rgba 形式", (theme) => {
    const appearance = resolveDialogAppearance(theme);
    expect(appearance.overlayColor).toMatch(/^rgba\(\d+, \d+, \d+, 0\.48\)$/);
  });

  it("角丸が4px未満にならない", () => {
    expect(resolveDialogAppearance(lightTheme).borderRadius).toBeGreaterThanOrEqual(4);
  });
});
