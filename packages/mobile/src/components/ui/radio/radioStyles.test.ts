import { describe, expect, it } from "vitest";

import { resolveRadioAppearance } from "@/components/ui/radio/radioStyles";
import { darkTheme, lightTheme } from "@/theme/tokens";

describe("resolveRadioAppearance", () => {
  it.each([lightTheme, darkTheme])("selected: false は borderStrong・1.5px の細い枠", (theme) => {
    const appearance = resolveRadioAppearance(theme, { selected: false, disabled: false });
    expect(appearance.borderColor).toBe(theme.colors.borderStrong);
    expect(appearance.borderWidth).toBe(1.5);
  });

  it.each([lightTheme, darkTheme])(
    "selected: true は primary・6px の太い枠(中央ドットを表現。DS 差異)",
    (theme) => {
      const appearance = resolveRadioAppearance(theme, { selected: true, disabled: false });
      expect(appearance.borderColor).toBe(theme.colors.primary);
      expect(appearance.borderWidth).toBe(6);
    },
  );

  it("disabled: true で opacity が下がる", () => {
    const appearance = resolveRadioAppearance(lightTheme, { selected: true, disabled: true });
    expect(appearance.opacity).toBeLessThan(1);
  });

  it("背景は常に surface(選択/非選択で変わらない)", () => {
    const selected = resolveRadioAppearance(lightTheme, { selected: true, disabled: false });
    const unselected = resolveRadioAppearance(lightTheme, { selected: false, disabled: false });
    expect(selected.backgroundColor).toBe(lightTheme.colors.surface);
    expect(unselected.backgroundColor).toBe(lightTheme.colors.surface);
  });

  it("実タップ領域(boxSize + hitSlop*2)が 44 以上", () => {
    const appearance = resolveRadioAppearance(lightTheme, { selected: false, disabled: false });
    expect(appearance.boxSize + appearance.hitSlop * 2).toBeGreaterThanOrEqual(44);
  });
});
