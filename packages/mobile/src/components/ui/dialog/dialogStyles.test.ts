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

  it.each([lightTheme, darkTheme])(
    "overlayColor は DS 実物の固定値(light/dark で変わらない)",
    (theme) => {
      const appearance = resolveDialogAppearance(theme);
      expect(appearance.overlayColor).toBe("rgba(27, 36, 48, 0.45)");
    },
  );

  it("角丸が radius-xl(DS 実物。以前は radius-lg で不一致だった)", () => {
    expect(resolveDialogAppearance(lightTheme).borderRadius).toBe(lightTheme.radius.xl);
  });
});
