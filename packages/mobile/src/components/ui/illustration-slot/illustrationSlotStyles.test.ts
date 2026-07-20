import { describe, expect, it } from "vitest";

import {
  resolveIllustrationSlotAppearance,
  type IllustrationSlotKind,
} from "@/components/ui/illustration-slot/illustrationSlotStyles";
import { darkTheme, lightTheme } from "@/theme/tokens";

const KINDS: IllustrationSlotKind[] = ["home-hero", "empty-walks", "empty-spots", "nav-idle"];

describe("resolveIllustrationSlotAppearance", () => {
  it.each([lightTheme, darkTheme])("全 kind にマッピングが存在する(網羅性)", (theme) => {
    for (const kind of KINDS) {
      const appearance = resolveIllustrationSlotAppearance(theme, { kind, size: "md" });
      expect(appearance.iconName).toBeTruthy();
      expect(appearance.tintColor).toBeTruthy();
      expect(appearance.iconColor).toBeTruthy();
    }
  });

  it("未知の kind はフォールバックする(例外にしない)", () => {
    const unknownKind = "does-not-exist" as IllustrationSlotKind;
    expect(() =>
      resolveIllustrationSlotAppearance(lightTheme, { kind: unknownKind, size: "md" }),
    ).not.toThrow();
    const appearance = resolveIllustrationSlotAppearance(lightTheme, {
      kind: unknownKind,
      size: "md",
    });
    expect(appearance.iconName).toBeTruthy();
  });

  it("size ごとに boxSize/iconSize が単調増加する", () => {
    const sizes: Array<"sm" | "md" | "lg"> = ["sm", "md", "lg"];
    const boxSizes = sizes.map(
      (size) => resolveIllustrationSlotAppearance(lightTheme, { kind: "home-hero", size }).boxSize,
    );
    expect(boxSizes[0]).toBeLessThan(boxSizes[1] as number);
    expect(boxSizes[1]).toBeLessThan(boxSizes[2] as number);
  });

  it("角丸が4px未満にならない", () => {
    const appearance = resolveIllustrationSlotAppearance(lightTheme, {
      kind: "home-hero",
      size: "md",
    });
    expect(appearance.borderRadius).toBeGreaterThanOrEqual(4);
  });
});
