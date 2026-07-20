import { describe, expect, it } from "vitest";

import { resolveCheckboxAppearance } from "@/components/ui/checkbox/checkboxStyles";
import { darkTheme, lightTheme } from "@/theme/tokens";

describe("resolveCheckboxAppearance", () => {
  it.each([lightTheme, darkTheme])("unchecked は塗りつぶされずアイコンが無い", (theme) => {
    const appearance = resolveCheckboxAppearance(theme, {
      checked: false,
      indeterminate: false,
      disabled: false,
    });
    expect(appearance.backgroundColor).toBe(theme.colors.surface);
    expect(appearance.borderColor).toBe(theme.colors.borderStrong);
    expect(appearance.iconName).toBeNull();
  });

  it.each([lightTheme, darkTheme])("checked は primary で塗りつぶされ check アイコン", (theme) => {
    const appearance = resolveCheckboxAppearance(theme, {
      checked: true,
      indeterminate: false,
      disabled: false,
    });
    expect(appearance.backgroundColor).toBe(theme.colors.primary);
    expect(appearance.borderColor).toBe(theme.colors.primary);
    expect(appearance.iconName).toBe("check");
  });

  it.each([lightTheme, darkTheme])(
    "indeterminate は primary で塗りつぶされ minus アイコン",
    (theme) => {
      const appearance = resolveCheckboxAppearance(theme, {
        checked: false,
        indeterminate: true,
        disabled: false,
      });
      expect(appearance.backgroundColor).toBe(theme.colors.primary);
      expect(appearance.iconName).toBe("minus");
    },
  );

  it("indeterminate は checked より優先される", () => {
    const appearance = resolveCheckboxAppearance(lightTheme, {
      checked: true,
      indeterminate: true,
      disabled: false,
    });
    expect(appearance.iconName).toBe("minus");
  });

  it("disabled: true で opacity が下がる", () => {
    const appearance = resolveCheckboxAppearance(lightTheme, {
      checked: true,
      indeterminate: false,
      disabled: true,
    });
    expect(appearance.opacity).toBeLessThan(1);
  });

  it("角丸が 4px 未満にならない", () => {
    const appearance = resolveCheckboxAppearance(lightTheme, {
      checked: false,
      indeterminate: false,
      disabled: false,
    });
    expect(appearance.borderRadius).toBeGreaterThanOrEqual(4);
  });

  it("実タップ領域(boxSize + hitSlop*2)が 44 以上", () => {
    const appearance = resolveCheckboxAppearance(lightTheme, {
      checked: false,
      indeterminate: false,
      disabled: false,
    });
    expect(appearance.boxSize + appearance.hitSlop * 2).toBeGreaterThanOrEqual(44);
  });
});
