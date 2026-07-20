import { describe, expect, it } from "vitest";

import { resolveSwitchAppearance, type SwitchSize } from "@/components/ui/switch/switchStyles";
import { darkTheme, lightTheme } from "@/theme/tokens";

const SIZES: SwitchSize[] = ["sm", "md"];

describe("resolveSwitchAppearance", () => {
  it.each([lightTheme, darkTheme])("value: true でトラック色が primary になる", (theme) => {
    const appearance = resolveSwitchAppearance(theme, { value: true, disabled: false, size: "md" });
    expect(appearance.trackColor).toBe(theme.colors.primary);
  });

  it.each([lightTheme, darkTheme])("value: false でトラック色が border になる", (theme) => {
    const appearance = resolveSwitchAppearance(theme, {
      value: false,
      disabled: false,
      size: "md",
    });
    expect(appearance.trackColor).toBe(theme.colors.border);
  });

  it("value: false で knobTranslateX が 0", () => {
    const appearance = resolveSwitchAppearance(lightTheme, {
      value: false,
      disabled: false,
      size: "md",
    });
    expect(appearance.knobTranslateX).toBe(0);
  });

  it("value: true で knobTranslateX が trackWidth - knobSize - knobInset*2", () => {
    const appearance = resolveSwitchAppearance(lightTheme, {
      value: true,
      disabled: false,
      size: "md",
    });
    expect(appearance.knobTranslateX).toBe(
      appearance.trackWidth - appearance.knobSize - appearance.knobInset * 2,
    );
    expect(appearance.knobTranslateX).toBeGreaterThan(0);
  });

  it("disabled: true で opacity が下がる", () => {
    const appearance = resolveSwitchAppearance(lightTheme, {
      value: true,
      disabled: true,
      size: "md",
    });
    expect(appearance.opacity).toBeLessThan(1);
  });

  it("全 size で実タップ領域(トラックの各辺 + hitSlop*2)が 44 以上", () => {
    for (const size of SIZES) {
      const appearance = resolveSwitchAppearance(lightTheme, {
        value: false,
        disabled: false,
        size,
      });
      expect(appearance.trackWidth + appearance.hitSlop * 2).toBeGreaterThanOrEqual(44);
      expect(appearance.trackHeight + appearance.hitSlop * 2).toBeGreaterThanOrEqual(44);
    }
  });
});
