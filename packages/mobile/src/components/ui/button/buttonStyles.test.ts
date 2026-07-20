import { describe, expect, it } from "vitest";

import {
  resolveButtonAppearance,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui/button/buttonStyles";
import { darkTheme, lightTheme } from "@/theme/tokens";

const VARIANTS: ButtonVariant[] = ["primary", "secondary", "outline", "ghost", "danger"];
const SIZES: ButtonSize[] = ["sm", "md", "lg"];

describe("resolveButtonAppearance", () => {
  it.each([lightTheme, darkTheme])("variant ごとに背景色/文字色が定義される", (theme) => {
    for (const variant of VARIANTS) {
      const appearance = resolveButtonAppearance(theme, {
        variant,
        size: "md",
        disabled: false,
        pressed: false,
      });
      expect(appearance.backgroundColor).toBeTruthy();
      expect(appearance.textColor).toBeTruthy();
    }
  });

  it("ghost は backgroundColor が透明系", () => {
    const appearance = resolveButtonAppearance(lightTheme, {
      variant: "ghost",
      size: "md",
      disabled: false,
      pressed: false,
    });
    expect(appearance.backgroundColor).toBe("transparent");
  });

  it("outline は borderWidth > 0(1.5px 固定)", () => {
    const appearance = resolveButtonAppearance(lightTheme, {
      variant: "outline",
      size: "md",
      disabled: false,
      pressed: false,
    });
    expect(appearance.borderWidth).toBeGreaterThan(0);
    expect(appearance.borderWidth).toBe(lightTheme.sizing.hairline * 1.5);
  });

  it("primary/secondary/ghost/danger は borderWidth が 0", () => {
    for (const variant of ["primary", "secondary", "ghost", "danger"] as const) {
      const appearance = resolveButtonAppearance(lightTheme, {
        variant,
        size: "md",
        disabled: false,
        pressed: false,
      });
      expect(appearance.borderWidth).toBe(0);
    }
  });

  it("secondary は背景が primaryTint、文字が primary", () => {
    const appearance = resolveButtonAppearance(lightTheme, {
      variant: "secondary",
      size: "md",
      disabled: false,
      pressed: false,
    });
    expect(appearance.backgroundColor).toBe(lightTheme.colors.primaryTint);
    expect(appearance.textColor).toBe(lightTheme.colors.primary);
  });

  it("danger は押下時に背景が dangerPressed へ暗くなり、文字は白のまま", () => {
    const notPressed = resolveButtonAppearance(lightTheme, {
      variant: "danger",
      size: "md",
      disabled: false,
      pressed: false,
    });
    const pressed = resolveButtonAppearance(lightTheme, {
      variant: "danger",
      size: "md",
      disabled: false,
      pressed: true,
    });
    expect(notPressed.backgroundColor).toBe(lightTheme.colors.danger);
    expect(pressed.backgroundColor).toBe(lightTheme.colors.dangerPressed);
    expect(pressed.textColor).toBe(lightTheme.colors.onPrimary);
    expect(notPressed.textColor).toBe(lightTheme.colors.onPrimary);
  });

  it("primary かつ非 disabled のときのみ boxShadow を持つ", () => {
    const primary = resolveButtonAppearance(lightTheme, {
      variant: "primary",
      size: "md",
      disabled: false,
      pressed: false,
    });
    const primaryDisabled = resolveButtonAppearance(lightTheme, {
      variant: "primary",
      size: "md",
      disabled: true,
      pressed: false,
    });
    expect(primary.boxShadow).toBe(lightTheme.shadow.sm);
    expect(primaryDisabled.boxShadow).toBeUndefined();
    for (const variant of ["secondary", "outline", "ghost", "danger"] as const) {
      const appearance = resolveButtonAppearance(lightTheme, {
        variant,
        size: "md",
        disabled: false,
        pressed: false,
      });
      expect(appearance.boxShadow).toBeUndefined();
    }
  });

  it("水平パディングは sm 16 / md 22 / lg 28(DS 実寸)", () => {
    const paddings = SIZES.map(
      (size) =>
        resolveButtonAppearance(lightTheme, {
          variant: "primary",
          size,
          disabled: false,
          pressed: false,
        }).paddingHorizontal,
    );
    expect(paddings).toEqual([16, 22, 28]);
  });

  it("全 variant で borderRadius が pill", () => {
    for (const variant of VARIANTS) {
      const appearance = resolveButtonAppearance(lightTheme, {
        variant,
        size: "md",
        disabled: false,
        pressed: false,
      });
      expect(appearance.borderRadius).toBe(lightTheme.radius.pill);
    }
  });

  it("disabled: true で opacity が下がり、文字色が textDisabled になる", () => {
    const appearance = resolveButtonAppearance(lightTheme, {
      variant: "primary",
      size: "md",
      disabled: true,
      pressed: false,
    });
    expect(appearance.opacity).toBeLessThan(1);
    expect(appearance.textColor).toBe(lightTheme.colors.textDisabled);
  });

  it("pressed: true で scale が 0.97、非押下で 1", () => {
    const pressed = resolveButtonAppearance(lightTheme, {
      variant: "primary",
      size: "md",
      disabled: false,
      pressed: true,
    });
    const notPressed = resolveButtonAppearance(lightTheme, {
      variant: "primary",
      size: "md",
      disabled: false,
      pressed: false,
    });
    expect(pressed.scale).toBe(0.97);
    expect(notPressed.scale).toBe(1);
  });

  it("size ごとに minHeight が単調増加する", () => {
    const heights = SIZES.map(
      (size) =>
        resolveButtonAppearance(lightTheme, {
          variant: "primary",
          size,
          disabled: false,
          pressed: false,
        }).minHeight,
    );
    expect(heights[0]).toBeLessThan(heights[1]);
    expect(heights[1]).toBeLessThan(heights[2]);
  });

  it("全 size で実タップ領域(minHeight + hitSlop*2)が 44 以上", () => {
    for (const size of SIZES) {
      const appearance = resolveButtonAppearance(lightTheme, {
        variant: "primary",
        size,
        disabled: false,
        pressed: false,
      });
      expect(appearance.minHeight + appearance.hitSlop * 2).toBeGreaterThanOrEqual(44);
    }
  });
});
