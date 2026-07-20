import { describe, expect, it } from "vitest";

import {
  resolveCardAppearance,
  type CardElevation,
  type CardPadding,
} from "@/components/ui/card/cardStyles";
import { lightTheme } from "@/theme/tokens";

const ELEVATIONS: CardElevation[] = ["none", "sm", "md", "lg"];
const PADDINGS: CardPadding[] = ["none", "sm", "md", "lg"];

describe("resolveCardAppearance", () => {
  it("elevation: none のとき boxShadow が undefined", () => {
    const appearance = resolveCardAppearance(lightTheme, {
      elevation: "none",
      padding: "md",
      pressed: false,
    });
    expect(appearance.boxShadow).toBeUndefined();
  });

  it.each(["sm", "md", "lg"] as const)(
    "elevation: %s のとき対応する shadow トークンを使う",
    (elevation) => {
      const appearance = resolveCardAppearance(lightTheme, {
        elevation,
        padding: "md",
        pressed: false,
      });
      expect(appearance.boxShadow).toBe(lightTheme.shadow[elevation]);
    },
  );

  it("padding ごとに padding 値が単調増加する(none を除く)", () => {
    const values = (["none", "sm", "md", "lg"] as const).map(
      (padding) =>
        resolveCardAppearance(lightTheme, { elevation: "md", padding, pressed: false }).padding,
    );
    expect(values[0]).toBe(0);
    expect(values[1]).toBeLessThan(values[2]);
    expect(values[2]).toBeLessThan(values[3]);
  });

  it("borderRadius は常に radius.lg(カード既定)", () => {
    for (const elevation of ELEVATIONS) {
      for (const padding of PADDINGS) {
        const appearance = resolveCardAppearance(lightTheme, {
          elevation,
          padding,
          pressed: false,
        });
        expect(appearance.borderRadius).toBe(lightTheme.radius.lg);
      }
    }
  });

  it("pressed: true で scale が 0.97、非押下で 1", () => {
    const pressed = resolveCardAppearance(lightTheme, {
      elevation: "md",
      padding: "md",
      pressed: true,
    });
    const notPressed = resolveCardAppearance(lightTheme, {
      elevation: "md",
      padding: "md",
      pressed: false,
    });
    expect(pressed.scale).toBe(0.97);
    expect(notPressed.scale).toBe(1);
  });
});
