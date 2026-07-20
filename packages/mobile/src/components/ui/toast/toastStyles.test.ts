import { describe, expect, it } from "vitest";

import { resolveToastAppearance } from "@/components/ui/toast/toastStyles";
import type { ToastVariant } from "@/components/ui/toast/toastQueue";
import { darkTheme, lightTheme } from "@/theme/tokens";

const VARIANTS: ToastVariant[] = ["info", "success", "warning", "danger"];

describe("resolveToastAppearance", () => {
  it.each([lightTheme, darkTheme])("variant ごとにアイコン色/アイコン名が定義される", (theme) => {
    for (const variant of VARIANTS) {
      const appearance = resolveToastAppearance(theme, { variant });
      expect(appearance.iconColor).toBeTruthy();
      expect(appearance.iconName).toBeTruthy();
    }
  });

  it.each([lightTheme, darkTheme])("背景は常に surfaceInverse", (theme) => {
    for (const variant of VARIANTS) {
      const appearance = resolveToastAppearance(theme, { variant });
      expect(appearance.backgroundColor).toBe(theme.colors.surfaceInverse);
    }
  });

  it("warning と danger は同じアイコン(alert-triangle)だが色は異なる", () => {
    const warning = resolveToastAppearance(lightTheme, { variant: "warning" });
    const danger = resolveToastAppearance(lightTheme, { variant: "danger" });
    expect(warning.iconName).toBe("alert-triangle");
    expect(danger.iconName).toBe("alert-triangle");
    expect(warning.iconColor).not.toBe(danger.iconColor);
  });
});
