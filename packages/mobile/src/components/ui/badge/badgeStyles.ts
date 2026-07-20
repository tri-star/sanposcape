import type { AppTheme } from "@/theme/tokens";

/**
 * DS の Badge tone は `info`(既定)/`success`/`warning`/`danger`/`neutral` の5種
 * (design/components/DS-COMPONENT-SPECS.md)。以前の実装の `primary` は DS に存在せず、
 * `info` の読み違いだった(DS 差異。B 追加分)。
 */
export type BadgeVariant = "info" | "neutral" | "success" | "warning" | "danger";

export type BadgeAppearance = {
  /** ラベル付きバッジの背景(tint 色) */
  backgroundColor: string;
  /** ラベルの文字色・ドットバッジの塗り色(variant の実色) */
  textColor: string;
  borderRadius: number;
  paddingHorizontal: number;
  paddingVertical: number;
  dotSize: number;
};

/**
 * DS の Badge は単一サイズのみ(パディング 5px 12px、ドット 6px)。以前の実装が持っていた
 * `sm`/`md` のサイズバリアントは DS に対応が無いため削除した(DS 差異。B 追加分)。
 */
const PADDING_VERTICAL = 5;
const PADDING_HORIZONTAL = 12;
const DOT_SIZE = 6;

/** セマンティック色(success/warning/danger)は Badge でのみ使う。装飾には使わない */
function resolveVariantPalette(
  theme: AppTheme,
  variant: BadgeVariant,
): { backgroundColor: string; textColor: string } {
  switch (variant) {
    case "neutral":
      return { backgroundColor: theme.colors.surfaceSunken, textColor: theme.colors.textMuted };
    case "info":
      return { backgroundColor: theme.colors.infoTint, textColor: theme.colors.info };
    case "success":
      return { backgroundColor: theme.colors.successTint, textColor: theme.colors.success };
    case "warning":
      return { backgroundColor: theme.colors.warningTint, textColor: theme.colors.warning };
    case "danger":
      return { backgroundColor: theme.colors.dangerTint, textColor: theme.colors.danger };
  }
}

/** variant から Badge の見た目を解決する純粋関数。角丸は常に pill */
export function resolveBadgeAppearance(
  theme: AppTheme,
  args: { variant: BadgeVariant },
): BadgeAppearance {
  const { variant } = args;
  const palette = resolveVariantPalette(theme, variant);

  return {
    backgroundColor: palette.backgroundColor,
    textColor: palette.textColor,
    borderRadius: theme.radius.pill,
    paddingHorizontal: PADDING_HORIZONTAL,
    paddingVertical: PADDING_VERTICAL,
    dotSize: DOT_SIZE,
  };
}
