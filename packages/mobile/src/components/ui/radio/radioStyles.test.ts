import { describe, expect, it } from "vitest";

import { resolveRadioAppearance } from "@/components/ui/radio/radioStyles";
import { darkTheme, lightTheme } from "@/theme/tokens";

describe("resolveRadioAppearance", () => {
  it.each([lightTheme, darkTheme])("selected: false は borderStrong・ドット非表示", (theme) => {
    const appearance = resolveRadioAppearance(theme, { selected: false, disabled: false });
    expect(appearance.borderColor).toBe(theme.colors.borderStrong);
    expect(appearance.showDot).toBe(false);
  });

  it.each([lightTheme, darkTheme])("selected: true は primary・ドット表示", (theme) => {
    const appearance = resolveRadioAppearance(theme, { selected: true, disabled: false });
    expect(appearance.borderColor).toBe(theme.colors.primary);
    expect(appearance.dotColor).toBe(theme.colors.primary);
    expect(appearance.showDot).toBe(true);
  });

  it("disabled: true で opacity が下がる", () => {
    const appearance = resolveRadioAppearance(lightTheme, { selected: true, disabled: true });
    expect(appearance.opacity).toBeLessThan(1);
  });

  it("実タップ領域(boxSize + hitSlop*2)が 44 以上", () => {
    const appearance = resolveRadioAppearance(lightTheme, { selected: false, disabled: false });
    expect(appearance.boxSize + appearance.hitSlop * 2).toBeGreaterThanOrEqual(44);
  });
});
