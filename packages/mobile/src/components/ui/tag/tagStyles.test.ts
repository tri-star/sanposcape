import { describe, expect, it } from "vitest";

import {
  resolveTagAppearance,
  TAG_HIT_SLOP,
  type TagCategory,
} from "@/components/ui/tag/tagStyles";
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

  it.each([lightTheme, darkTheme])(
    "selected: true は背景がカテゴリ色そのもの・枠線なし",
    (theme) => {
      const appearance = resolveTagAppearance(theme, { category: "park", selected: true });
      expect(appearance.backgroundColor).toBe(theme.colors.category.park);
      expect(appearance.textColor).toBe(theme.colors.onPrimary);
      expect(appearance.iconColor).toBe(theme.colors.onPrimary);
      expect(appearance.borderWidth).toBe(0);
    },
  );

  it.each([lightTheme, darkTheme])(
    "selected: false は surface-card 背景 + 1.5px border-subtle 枠線、文字は text-primary(B-1)",
    (theme) => {
      const appearance = resolveTagAppearance(theme, { category: "cafe", selected: false });
      expect(appearance.backgroundColor).toBe(theme.colors.surface);
      expect(appearance.textColor).toBe(theme.colors.text);
      expect(appearance.borderColor).toBe(theme.colors.border);
      expect(appearance.borderWidth).toBe(theme.sizing.hairline * 1.5);
      // アイコンのみカテゴリ色を維持する
      expect(appearance.iconColor).toBe(theme.colors.category.cafe);
    },
  );

  it.each([lightTheme, darkTheme])(
    "category 未指定は neutral(textMuted)をアイコン色に使う",
    (theme) => {
      const selected = resolveTagAppearance(theme, { selected: true });
      const unselected = resolveTagAppearance(theme, { selected: false });
      expect(selected.backgroundColor).toBe(theme.colors.textMuted);
      expect(unselected.iconColor).toBe(theme.colors.textMuted);
      expect(unselected.textColor).toBe(theme.colors.text);
    },
  );

  it("4カテゴリの色が互いに異なる(カテゴリ間で色が衝突しない)", () => {
    const colors = CATEGORIES.map(
      (category) => resolveTagAppearance(lightTheme, { category, selected: true }).backgroundColor,
    );
    expect(new Set(colors).size).toBe(CATEGORIES.length);
  });

  it("実タップ領域(見た目の高さ + hitSlop*2)が44以上(C-1)", () => {
    const APPROX_HEIGHT = 30;
    expect(APPROX_HEIGHT + TAG_HIT_SLOP * 2).toBeGreaterThanOrEqual(44);
  });
});
