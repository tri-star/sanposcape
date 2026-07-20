import { describe, expect, it } from "vitest";

import type { ToastVariant } from "@/components/ui/toast/toastQueue";
import { resolveToastAppearance } from "@/components/ui/toast/toastStyles";
import { darkTheme, lightTheme } from "@/theme/tokens";

const VARIANTS: ToastVariant[] = ["default", "success", "danger"];

describe("resolveToastAppearance", () => {
  it.each([lightTheme, darkTheme])(
    "variant ごとに背景色/文字色/アイコン名が定義される",
    (theme) => {
      for (const variant of VARIANTS) {
        const appearance = resolveToastAppearance(theme, { variant });
        expect(appearance.backgroundColor).toBeTruthy();
        expect(appearance.textColor).toBeTruthy();
        expect(appearance.iconName).toBeTruthy();
      }
    },
  );

  it.each([lightTheme, darkTheme])("default は surfaceInverse 背景・surface 文字色", (theme) => {
    const appearance = resolveToastAppearance(theme, { variant: "default" });
    expect(appearance.backgroundColor).toBe(theme.colors.surfaceInverse);
    expect(appearance.textColor).toBe(theme.colors.textOnPrimary);
    expect(appearance.iconName).toBe("info");
  });

  it("success/danger は tone の実色を背景にし、文字/アイコンは白(DS 差異)", () => {
    const success = resolveToastAppearance(lightTheme, { variant: "success" });
    const danger = resolveToastAppearance(lightTheme, { variant: "danger" });
    expect(success.backgroundColor).toBe(lightTheme.colors.success);
    expect(success.textColor).toBe("#fff");
    expect(success.iconName).toBe("check-circle-2");
    expect(danger.backgroundColor).toBe(lightTheme.colors.danger);
    expect(danger.textColor).toBe("#fff");
    expect(danger.iconName).toBe("alert-circle");
  });

  it("DS 実寸のパディング(12px 18px)を持つ", () => {
    const appearance = resolveToastAppearance(lightTheme, { variant: "default" });
    expect(appearance.paddingVertical).toBe(12);
    expect(appearance.paddingHorizontal).toBe(18);
  });
});
