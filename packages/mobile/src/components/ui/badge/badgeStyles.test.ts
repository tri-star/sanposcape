import { describe, expect, it } from "vitest";

import { resolveBadgeAppearance, type BadgeVariant } from "@/components/ui/badge/badgeStyles";
import { darkTheme, lightTheme } from "@/theme/tokens";

const VARIANTS: BadgeVariant[] = ["neutral", "info", "success", "warning", "danger"];

describe("resolveBadgeAppearance", () => {
  it.each([lightTheme, darkTheme])("variant ごとに背景色/文字色が定義される", (theme) => {
    for (const variant of VARIANTS) {
      const appearance = resolveBadgeAppearance(theme, { variant });
      expect(appearance.backgroundColor).toBeTruthy();
      expect(appearance.textColor).toBeTruthy();
    }
  });

  it.each([lightTheme, darkTheme])("variant ごとに背景色と文字色が異なる(視認性)", (theme) => {
    for (const variant of VARIANTS) {
      const appearance = resolveBadgeAppearance(theme, { variant });
      expect(appearance.backgroundColor).not.toBe(appearance.textColor);
    }
  });

  it("全 variant で borderRadius が pill", () => {
    for (const variant of VARIANTS) {
      const appearance = resolveBadgeAppearance(lightTheme, { variant });
      expect(appearance.borderRadius).toBe(lightTheme.radius.pill);
    }
  });

  it("danger は colors.danger 系を使う", () => {
    const appearance = resolveBadgeAppearance(lightTheme, { variant: "danger" });
    expect(appearance.textColor).toBe(lightTheme.colors.danger);
    expect(appearance.backgroundColor).toBe(lightTheme.colors.dangerTint);
  });

  it("info は colors.info 系を使う(DS の既定 tone)", () => {
    const appearance = resolveBadgeAppearance(lightTheme, { variant: "info" });
    expect(appearance.textColor).toBe(lightTheme.colors.info);
    expect(appearance.backgroundColor).toBe(lightTheme.colors.infoTint);
  });

  it("DS 実寸(パディング 5/12、ドット6px)の単一サイズのみ", () => {
    const appearance = resolveBadgeAppearance(lightTheme, { variant: "neutral" });
    expect(appearance.paddingVertical).toBe(5);
    expect(appearance.paddingHorizontal).toBe(12);
    expect(appearance.dotSize).toBe(6);
  });
});
