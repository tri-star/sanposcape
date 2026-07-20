import { describe, expect, it } from "vitest";

import {
  resolveIconButtonAppearance,
  type IconButtonSize,
  type IconButtonVariant,
} from "@/components/ui/icon-button/iconButtonStyles";
import { lightTheme } from "@/theme/tokens";

const VARIANTS: IconButtonVariant[] = ["primary", "secondary", "ghost"];
const SIZES: IconButtonSize[] = ["sm", "md", "lg"];

describe("resolveIconButtonAppearance", () => {
  it("全 size で実タップ領域(boxSize + hitSlop*2)が 44 以上", () => {
    for (const size of SIZES) {
      const appearance = resolveIconButtonAppearance(lightTheme, {
        variant: "primary",
        size,
        disabled: false,
        pressed: false,
      });
      expect(appearance.boxSize + appearance.hitSlop * 2).toBeGreaterThanOrEqual(44);
    }
  });

  it("size ごとに boxSize / iconSize が単調増加する", () => {
    const boxSizes = SIZES.map(
      (size) =>
        resolveIconButtonAppearance(lightTheme, {
          variant: "primary",
          size,
          disabled: false,
          pressed: false,
        }).boxSize,
    );
    expect(boxSizes[0]).toBeLessThan(boxSizes[1]);
    expect(boxSizes[1]).toBeLessThan(boxSizes[2]);
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

  it("secondary は borderWidth > 0、primary/ghost は 0", () => {
    const secondary = resolveIconButtonAppearance(lightTheme, {
      variant: "secondary",
      size: "md",
      disabled: false,
      pressed: false,
    });
    const primary = resolveIconButtonAppearance(lightTheme, {
      variant: "primary",
      size: "md",
      disabled: false,
      pressed: false,
    });
    const ghost = resolveIconButtonAppearance(lightTheme, {
      variant: "ghost",
      size: "md",
      disabled: false,
      pressed: false,
    });
    expect(secondary.borderWidth).toBeGreaterThan(0);
    expect(primary.borderWidth).toBe(0);
    expect(ghost.borderWidth).toBe(0);
  });

  it("disabled: true で opacity が下がり iconColor が textDisabled になる", () => {
    const appearance = resolveIconButtonAppearance(lightTheme, {
      variant: "primary",
      size: "md",
      disabled: true,
      pressed: false,
    });
    expect(appearance.opacity).toBeLessThan(1);
    expect(appearance.iconColor).toBe(lightTheme.colors.textDisabled);
  });

  it("pressed: true で scale が 0.97", () => {
    const appearance = resolveIconButtonAppearance(lightTheme, {
      variant: "primary",
      size: "md",
      disabled: false,
      pressed: true,
    });
    expect(appearance.scale).toBe(0.97);
  });
});
