import { resolveHitSlop } from "@/lib/resolveHitSlop";
import type { AppTheme } from "@/theme/tokens";

/**
 * DS の IconButton variant は `filled`/`tinted`/`surface`(既定)/`ghost` の4種
 * (design/components/DS-COMPONENT-SPECS.md)。以前の実装の `primary`/`secondary`/`ghost` は
 * DS の命名・配色のどちらとも一致していなかった(DS 差異。B 追加分)。
 */
export type IconButtonVariant = "filled" | "tinted" | "surface" | "ghost";
export type IconButtonSize = "sm" | "md" | "lg";

export type IconButtonAppearance = {
  backgroundColor: string;
  iconColor: string;
  boxSize: number;
  iconSize: number;
  /** `surface` variant のみ `shadow-sm` */
  boxShadow: string | undefined;
  /** 見た目の boxSize が 44px 未満のとき、実タップ領域を 44px まで広げるための片側マージン */
  hitSlop: number;
  opacity: number;
  scale: number;
};

/**
 * サイズ/アイコンサイズは DS 実寸(sm 32/md 44/lg 54、アイコン 16/20/22)。
 * `sm` は theme.sizing.controlSm(34)と僅かに異なるため、DS 値優先でリテラルにする。
 */
const SIZE_CONFIG: Record<IconButtonSize, { boxSize: number; iconSize: number }> = {
  sm: { boxSize: 32, iconSize: 16 },
  md: { boxSize: 44, iconSize: 20 },
  lg: { boxSize: 54, iconSize: 22 },
};

/**
 * variant/size/状態 から IconButton の見た目を解決する純粋関数。
 */
export function resolveIconButtonAppearance(
  theme: AppTheme,
  args: { variant: IconButtonVariant; size: IconButtonSize; disabled: boolean; pressed: boolean },
): IconButtonAppearance {
  const { variant, size, disabled, pressed } = args;
  const sizeConfig = SIZE_CONFIG[size];
  const hitSlop = resolveHitSlop(sizeConfig.boxSize);
  const palette = resolveVariantPalette(theme, variant, pressed);

  return {
    backgroundColor: palette.backgroundColor,
    iconColor: disabled ? theme.colors.textDisabled : palette.iconColor,
    boxSize: sizeConfig.boxSize,
    iconSize: sizeConfig.iconSize,
    boxShadow: variant === "surface" && !disabled ? theme.shadow.sm : undefined,
    hitSlop,
    opacity: disabled ? 0.4 : 1,
    scale: pressed ? 0.97 : 1,
  };
}

type VariantPalette = {
  backgroundColor: string;
  iconColor: string;
};

function resolveVariantPalette(
  theme: AppTheme,
  variant: IconButtonVariant,
  pressed: boolean,
): VariantPalette {
  switch (variant) {
    case "filled":
      return {
        backgroundColor: pressed ? theme.colors.primaryPressed : theme.colors.primary,
        iconColor: theme.colors.onPrimary,
      };
    case "tinted":
      return {
        backgroundColor: pressed ? theme.colors.secondaryPressed : theme.colors.primaryTint,
        iconColor: theme.colors.primary,
      };
    case "surface":
      return {
        backgroundColor: pressed ? theme.colors.surfaceSunken : theme.colors.surface,
        iconColor: theme.colors.text,
      };
    case "ghost":
      return {
        backgroundColor: pressed ? theme.colors.surfaceSunken : "transparent",
        iconColor: theme.colors.textMuted,
      };
  }
}
