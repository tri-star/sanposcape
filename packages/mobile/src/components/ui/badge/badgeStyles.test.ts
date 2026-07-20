import { describe, expect, it } from "vitest";

import { resolveBadgeAppearance, type BadgeVariant } from "@/components/ui/badge/badgeStyles";
import { darkTheme, lightTheme } from "@/theme/tokens";

const VARIANTS: BadgeVariant[] = ["neutral", "primary", "success", "warning", "danger"];

describe("resolveBadgeAppearance", () => {
  it.each([lightTheme, darkTheme])("variant ごとに背景色/文字色が定義される", (theme) => {
    for (const variant of VARIANTS) {
      const appearance = resolveBadgeAppearance(theme, { variant, size: "md" });
      expect(appearance.backgroundColor).toBeTruthy();
      expect(appearance.textColor).toBeTruthy();
    }
  });

  it.each([lightTheme, darkTheme])("variant ごとに背景色と文字色が異なる(視認性)", (theme) => {
    for (const variant of VARIANTS) {
      const appearance = resolveBadgeAppearance(theme, { variant, size: "md" });
      expect(appearance.backgroundColor).not.toBe(appearance.textColor);
    }
  });

  it("全 variant で borderRadius が pill", () => {
    for (const variant of VARIANTS) {
      const appearance = resolveBadgeAppearance(lightTheme, { variant, size: "md" });
      expect(appearance.borderRadius).toBe(lightTheme.radius.pill);
    }
  });

  it("danger は colors.danger 系を使う", () => {
    const appearance = resolveBadgeAppearance(lightTheme, { variant: "danger", size: "md" });
    expect(appearance.textColor).toBe(lightTheme.colors.danger);
    expect(appearance.backgroundColor).toBe(lightTheme.colors.dangerTint);
  });

  it("sm は md より height/dotSize が小さい", () => {
    const sm = resolveBadgeAppearance(lightTheme, { variant: "neutral", size: "sm" });
    const md = resolveBadgeAppearance(lightTheme, { variant: "neutral", size: "md" });
    expect(sm.height).toBeLessThan(md.height);
    expect(sm.dotSize).toBeLessThan(md.dotSize);
  });
});
