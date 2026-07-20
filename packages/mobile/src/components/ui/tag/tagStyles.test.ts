import { describe, expect, it } from "vitest";

import { resolveTagAppearance, type TagCategory } from "@/components/ui/tag/tagStyles";
import { darkTheme, lightTheme } from "@/theme/tokens";

const CATEGORIES: TagCategory[] = ["park", "cafe", "culture", "station"];

describe("resolveTagAppearance", () => {
  it.each([lightTheme, darkTheme])(
    "4カテゴリ x selected の2状態で背景色/文字色が定義され、互いに異なる",
    (theme) => {
      for (const category of CATEGORIES) {
        for (const selected of [true, false]) {
          const appearance = resolveTagAppearance(theme, { category, selected });
          expect(appearance.backgroundColor).toBeTruthy();
          expect(appearance.textColor).toBeTruthy();
          expect(appearance.backgroundColor).not.toBe(appearance.textColor);
        }
      }
    },
  );

  it.each([lightTheme, darkTheme])("selected: true は背景がカテゴリ色そのもの", (theme) => {
    const appearance = resolveTagAppearance(theme, { category: "park", selected: true });
    expect(appearance.backgroundColor).toBe(theme.colors.category.park);
    expect(appearance.textColor).toBe(theme.colors.onPrimary);
  });

  it.each([lightTheme, darkTheme])("selected: false は文字色がカテゴリ色", (theme) => {
    const appearance = resolveTagAppearance(theme, { category: "cafe", selected: false });
    expect(appearance.textColor).toBe(theme.colors.category.cafe);
  });

  it.each([lightTheme, darkTheme])("category 未指定は neutral(textMuted)を使う", (theme) => {
    const selected = resolveTagAppearance(theme, { selected: true });
    const unselected = resolveTagAppearance(theme, { selected: false });
    expect(selected.backgroundColor).toBe(theme.colors.textMuted);
    expect(unselected.textColor).toBe(theme.colors.textMuted);
  });

  it("4カテゴリの色が互いに異なる(カテゴリ間で色が衝突しない)", () => {
    const colors = CATEGORIES.map(
      (category) => resolveTagAppearance(lightTheme, { category, selected: true }).backgroundColor,
    );
    expect(new Set(colors).size).toBe(CATEGORIES.length);
  });
});
