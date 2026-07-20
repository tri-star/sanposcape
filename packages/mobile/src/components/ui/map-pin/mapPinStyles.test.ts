import { describe, expect, it } from "vitest";

import { resolveMapPinAppearance, type MapPinCategory } from "@/components/ui/map-pin/mapPinStyles";
import { darkTheme, lightTheme } from "@/theme/tokens";

const CATEGORIES: MapPinCategory[] = ["park", "cafe", "culture", "station"];

describe("resolveMapPinAppearance", () => {
  it.each([lightTheme, darkTheme])(
    "4カテゴリ全てで色が定義されている(undefined を返さない)",
    (theme) => {
      for (const category of CATEGORIES) {
        const appearance = resolveMapPinAppearance(theme, {
          category,
          selected: false,
          variant: "category",
        });
        expect(appearance.fillColor).toBeTruthy();
      }
    },
  );

  it.each([lightTheme, darkTheme])("カテゴリごとに色が異なる(カテゴリ間で衝突しない)", (theme) => {
    const colors = CATEGORIES.map(
      (category) =>
        resolveMapPinAppearance(theme, { category, selected: false, variant: "category" })
          .fillColor,
    );
    expect(new Set(colors).size).toBe(CATEGORIES.length);
  });

  it.each([lightTheme, darkTheme])(
    "current/destination はカテゴリ色ではなく info/danger を使う",
    (theme) => {
      // station カテゴリ色は DS 上 danger と同じ赤(red-500)を共有するため、
      // 「カテゴリ色の集合に含まれないこと」ではなく「意図した semantic トークンと一致すること」を検証する。
      const current = resolveMapPinAppearance(theme, {
        category: "park",
        selected: false,
        variant: "current",
      });
      const destination = resolveMapPinAppearance(theme, {
        category: "park",
        selected: false,
        variant: "destination",
      });
      expect(current.fillColor).toBe(theme.colors.info);
      expect(destination.fillColor).toBe(theme.colors.danger);
    },
  );

  it("selected: true でサイズが拡大する", () => {
    const unselected = resolveMapPinAppearance(lightTheme, {
      category: "park",
      selected: false,
      variant: "category",
    });
    const selected = resolveMapPinAppearance(lightTheme, {
      category: "park",
      selected: true,
      variant: "category",
    });
    expect(selected.size).toBeGreaterThan(unselected.size);
  });
});
