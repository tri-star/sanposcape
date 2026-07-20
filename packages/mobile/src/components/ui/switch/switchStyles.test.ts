import { describe, expect, it } from "vitest";

import { resolveSwitchAppearance } from "@/components/ui/switch/switchStyles";
import { darkTheme, lightTheme } from "@/theme/tokens";

describe("resolveSwitchAppearance", () => {
  it.each([lightTheme, darkTheme])("value: true でトラック色が primary になる", (theme) => {
    const appearance = resolveSwitchAppearance(theme, { value: true, disabled: false });
    expect(appearance.trackColor).toBe(theme.colors.primary);
  });

  it.each([lightTheme, darkTheme])("value: false でトラック色が border になる", (theme) => {
    const appearance = resolveSwitchAppearance(theme, { value: false, disabled: false });
    expect(appearance.trackColor).toBe(theme.colors.border);
  });

  it("value: false で knobTranslateX が 0", () => {
    const appearance = resolveSwitchAppearance(lightTheme, { value: false, disabled: false });
    expect(appearance.knobTranslateX).toBe(0);
  });

  it("value: true で knobTranslateX が trackWidth - knobSize - knobInset*2", () => {
    const appearance = resolveSwitchAppearance(lightTheme, { value: true, disabled: false });
    expect(appearance.knobTranslateX).toBe(
      appearance.trackWidth - appearance.knobSize - appearance.knobInset * 2,
    );
    expect(appearance.knobTranslateX).toBeGreaterThan(0);
  });

  it("disabled: true で opacity が下がる", () => {
    const appearance = resolveSwitchAppearance(lightTheme, { value: true, disabled: true });
    expect(appearance.opacity).toBeLessThan(1);
  });

  it("DS 実寸(トラック 44x26 / ノブ 20 / インセット3)に一致する(B-5)", () => {
    const appearance = resolveSwitchAppearance(lightTheme, { value: false, disabled: false });
    expect(appearance.trackWidth).toBe(44);
    expect(appearance.trackHeight).toBe(26);
    expect(appearance.knobSize).toBe(20);
    expect(appearance.knobInset).toBe(3);
  });

  it("ノブは常に #fff で shadow-xs を持つ", () => {
    const light = resolveSwitchAppearance(lightTheme, { value: false, disabled: false });
    const dark = resolveSwitchAppearance(darkTheme, { value: false, disabled: false });
    expect(light.knobColor).toBe("#fff");
    expect(dark.knobColor).toBe("#fff");
    expect(light.knobBoxShadow).toBe(lightTheme.shadow.xs);
  });

  it("実タップ領域(トラックの各辺 + hitSlop*2)が 44 以上", () => {
    const appearance = resolveSwitchAppearance(lightTheme, { value: false, disabled: false });
    expect(appearance.trackWidth + appearance.hitSlop * 2).toBeGreaterThanOrEqual(44);
    expect(appearance.trackHeight + appearance.hitSlop * 2).toBeGreaterThanOrEqual(44);
  });
});
