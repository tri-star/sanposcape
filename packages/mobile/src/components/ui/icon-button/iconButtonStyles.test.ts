import { describe, expect, it } from "vitest";

import {
  resolveIconButtonAppearance,
  type IconButtonSize,
  type IconButtonVariant,
} from "@/components/ui/icon-button/iconButtonStyles";
import { lightTheme } from "@/theme/tokens";

const VARIANTS: IconButtonVariant[] = ["filled", "tinted", "surface", "ghost"];
const SIZES: IconButtonSize[] = ["sm", "md", "lg"];

describe("resolveIconButtonAppearance", () => {
  it("全 size で実タップ領域(boxSize + hitSlop*2)が 44 以上", () => {
    for (const size of SIZES) {
      const appearance = resolveIconButtonAppearance(lightTheme, {
        variant: "filled",
        size,
        disabled: false,
        pressed: false,
      });
      expect(appearance.boxSize + appearance.hitSlop * 2).toBeGreaterThanOrEqual(44);
    }
  });

  it("DS 実寸(sm 32 / md 44 / lg 54、アイコン 16/20/22)に一致する", () => {
    const sizes = SIZES.map((size) =>
      resolveIconButtonAppearance(lightTheme, {
        variant: "filled",
        size,
        disabled: false,
        pressed: false,
      }),
    );
    expect(sizes.map((s) => s.boxSize)).toEqual([32, 44, 54]);
    expect(sizes.map((s) => s.iconSize)).toEqual([16, 20, 22]);
  });

  it.each(VARIANTS)("%s variant で backgroundColor/iconColor が定義される", (variant) => {
    const appearance = resolveIconButtonAppearance(lightTheme, {
      variant,
      size: "md",
      disabled: false,
      pressed: false,
    });
    expect(appearance.backgroundColor).toBeTruthy();
    expect(appearance.iconColor).toBeTruthy();
  });

  it("surface variant のみ非 disabled で boxShadow を持つ", () => {
    for (const variant of VARIANTS) {
      const appearance = resolveIconButtonAppearance(lightTheme, {
        variant,
        size: "md",
        disabled: false,
        pressed: false,
      });
      if (variant === "surface") {
        expect(appearance.boxShadow).toBe(lightTheme.shadow.sm);
      } else {
        expect(appearance.boxShadow).toBeUndefined();
      }
    }
  });

  it("disabled: true で opacity が下がり iconColor が textDisabled になる(shadow も消える)", () => {
    const appearance = resolveIconButtonAppearance(lightTheme, {
      variant: "surface",
      size: "md",
      disabled: true,
      pressed: false,
    });
    expect(appearance.opacity).toBeLessThan(1);
    expect(appearance.iconColor).toBe(lightTheme.colors.textDisabled);
    expect(appearance.boxShadow).toBeUndefined();
  });

  it("pressed: true で scale が 0.97", () => {
    const appearance = resolveIconButtonAppearance(lightTheme, {
      variant: "filled",
      size: "md",
      disabled: false,
      pressed: true,
    });
    expect(appearance.scale).toBe(0.97);
  });
});
