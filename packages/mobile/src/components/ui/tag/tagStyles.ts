import type { AppTheme } from "@/theme/tokens";

export type TagCategory = "park" | "cafe" | "culture" | "station";

export type TagAppearance = {
  backgroundColor: string;
  textColor: string;
};

/**
 * category/selected から Tag の見た目を解決する純粋関数。
 * `selected` は背景がカテゴリ色そのもの、非選択は tint 背景 + カテゴリ色の文字。
 * DS にはカテゴリごとの tint(薄色)トークンが存在しないため、非選択時の背景は
 * 汎用の tint(`surfaceTint`) / neutral は `surfaceSunken` を代用する。
 */
export function resolveTagAppearance(
  theme: AppTheme,
  args: { category?: TagCategory; selected: boolean },
): TagAppearance {
  const { category, selected } = args;
  const categoryColor =
    category === undefined ? theme.colors.textMuted : theme.colors.category[category];

  if (selected) {
    return {
      backgroundColor: categoryColor,
      textColor: theme.colors.onPrimary,
    };
  }

  return {
    backgroundColor: category === undefined ? theme.colors.surfaceSunken : theme.colors.surfaceTint,
    textColor: categoryColor,
  };
}
