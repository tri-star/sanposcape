import { describe, expect, it } from "vitest";

import { resolveInputAppearance } from "@/components/ui/input/inputStyles";
import { darkTheme, lightTheme } from "@/theme/tokens";

describe("resolveInputAppearance", () => {
  it.each([lightTheme, darkTheme])("既定状態は border 色を使う", (theme) => {
    const appearance = resolveInputAppearance(theme, {
      focused: false,
      disabled: false,
      hasError: false,
    });
    expect(appearance.borderColor).toBe(theme.colors.border);
    expect(appearance.opacity).toBe(1);
  });

  it.each([lightTheme, darkTheme])("focused で枠色が borderFocus になる", (theme) => {
    const appearance = resolveInputAppearance(theme, {
      focused: true,
      disabled: false,
      hasError: false,
    });
    expect(appearance.borderColor).toBe(theme.colors.borderFocus);
    expect(appearance.iconColor).toBe(theme.colors.primary);
  });

  it.each([lightTheme, darkTheme])("hasError は focused/disabled より優先される", (theme) => {
    const appearance = resolveInputAppearance(theme, {
      focused: true,
      disabled: true,
      hasError: true,
    });
    expect(appearance.borderColor).toBe(theme.colors.danger);
    expect(appearance.helperColor).toBe(theme.colors.danger);
    expect(appearance.opacity).toBe(1);
  });

  it.each([lightTheme, darkTheme])(
    "disabled は hasError が無ければ focused より優先される",
    (theme) => {
      const appearance = resolveInputAppearance(theme, {
        focused: true,
        disabled: true,
        hasError: false,
      });
      expect(appearance.backgroundColor).toBe(theme.colors.surfaceSunken);
      expect(appearance.textColor).toBe(theme.colors.textDisabled);
      expect(appearance.opacity).toBeLessThan(1);
    },
  );

  it.each([lightTheme, darkTheme])(
    "borderWidth は状態に関わらず常に hairline の1.5倍で固定(B-7。レイアウトが揺れないように)",
    (theme) => {
      const expected = theme.sizing.hairline * 1.5;
      const combinations = [
        { focused: false, disabled: false, hasError: false },
        { focused: true, disabled: false, hasError: false },
        { focused: false, disabled: true, hasError: false },
        { focused: false, disabled: false, hasError: true },
        { focused: true, disabled: true, hasError: true },
      ];
      for (const args of combinations) {
        expect(resolveInputAppearance(theme, args).borderWidth).toBe(expected);
      }
    },
  );
});
