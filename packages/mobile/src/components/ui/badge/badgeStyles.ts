import type { AppTheme } from "@/theme/tokens";

export type BadgeVariant = "neutral" | "primary" | "success" | "warning" | "danger";
export type BadgeSize = "sm" | "md";

export type BadgeAppearance = {
  /** ラベル付きバッジの背景(tint 色) */
  backgroundColor: string;
  /** ラベルの文字色・ドットバッジの塗り色(variant の実色) */
  textColor: string;
  borderRadius: number;
  paddingHorizontal: number;
  height: number;
  dotSize: number;
};

const HEIGHT: Record<BadgeSize, number> = { sm: 18, md: 22 };
const DOT_SIZE: Record<BadgeSize, number> = { sm: 8, md: 10 };
const PADDING_HORIZONTAL: Record<BadgeSize, keyof AppTheme["spacing"]> = { sm: 8, md: 12 };

/** セマンティック色(success/warning/danger)は Badge でのみ使う。装飾には使わない */
function resolveVariantPalette(
  theme: AppTheme,
  variant: BadgeVariant,
): { backgroundColor: string; textColor: string } {
  switch (variant) {
    case "neutral":
      return { backgroundColor: theme.colors.surfaceSunken, textColor: theme.colors.textMuted };
    case "primary":
      return { backgroundColor: theme.colors.primaryTint, textColor: theme.colors.primary };
    case "success":
      return { backgroundColor: theme.colors.successTint, textColor: theme.colors.success };
    case "warning":
      return { backgroundColor: theme.colors.warningTint, textColor: theme.colors.warning };
    case "danger":
      return { backgroundColor: theme.colors.dangerTint, textColor: theme.colors.danger };
  }
}

/** variant/size から Badge の見た目を解決する純粋関数。角丸は常に pill */
export function resolveBadgeAppearance(
  theme: AppTheme,
  args: { variant: BadgeVariant; size: BadgeSize },
): BadgeAppearance {
  const { variant, size } = args;
  const palette = resolveVariantPalette(theme, variant);

  return {
    backgroundColor: palette.backgroundColor,
    textColor: palette.textColor,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing[PADDING_HORIZONTAL[size]],
    height: HEIGHT[size],
    dotSize: DOT_SIZE[size],
  };
}
