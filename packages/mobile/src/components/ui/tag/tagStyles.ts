import { resolveHitSlop } from "@/lib/resolveHitSlop";
import type { AppTheme } from "@/theme/tokens";

export type TagCategory = "park" | "cafe" | "culture" | "station";

export type TagAppearance = {
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  borderWidth: number;
  iconColor: string;
};

/** Tag の見た目の高さ(パディング 8px + フォント想定行高)。DS に専用トークンが無い実用値 */
const APPROX_HEIGHT = 30;

/** タップ領域の実測値(44px 未満を hitSlop で補う。C-1) */
export const TAG_HIT_SLOP = resolveHitSlop(APPROX_HEIGHT);

/**
 * category/selected から Tag の見た目を解決する純粋関数。
 * DS: 非選択は `surface-card` 背景 + 1.5px `border-subtle` の枠線 + `text-primary` の文字。
 * アイコンのみカテゴリ色。選択時は背景がカテゴリ色そのもの・枠線なし・文字/アイコンとも白(B-1)。
 * 「DS にカテゴリ別 tint トークンが無いため tint 背景で代用する」という以前の判断は誤りで、
 * DS はそもそも tint を使わず白 + 枠線が答えだった(ds-fidelity-review.md #1)。
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
      borderColor: "transparent",
      borderWidth: 0,
      iconColor: theme.colors.onPrimary,
    };
  }

  return {
    backgroundColor: theme.colors.surface,
    textColor: theme.colors.text,
    borderColor: theme.colors.border,
    borderWidth: theme.sizing.hairline * 1.5,
    iconColor: categoryColor,
  };
}
