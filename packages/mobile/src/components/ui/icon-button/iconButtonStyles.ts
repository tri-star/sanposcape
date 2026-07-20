import type { AppTheme } from "@/theme/tokens";

export type IconButtonVariant = "primary" | "secondary" | "ghost";
export type IconButtonSize = "sm" | "md" | "lg";

export type IconButtonAppearance = {
  backgroundColor: string;
  iconColor: string;
  borderColor: string;
  borderWidth: number;
  boxSize: number;
  iconSize: number;
  /** 見た目の boxSize が 44px 未満のとき、実タップ領域を 44px まで広げるための片側マージン */
  hitSlop: number;
  opacity: number;
  scale: number;
};

const MIN_TOUCH_TARGET = 44;

const SIZE_CONFIG: Record<
  IconButtonSize,
  { boxSizeKey: keyof AppTheme["sizing"]; iconSize: number }
> = {
  sm: { boxSizeKey: "controlSm", iconSize: 16 },
  md: { boxSizeKey: "controlMd", iconSize: 20 },
  lg: { boxSizeKey: "controlLg", iconSize: 24 },
};

/**
 * variant/size/状態 から IconButton の見た目を解決する純粋関数。
 * `boxSize` は DS の `--control-*` をそのまま使うため、sm(34px)は 44px を下回る。
 * `hitSlop` で実タップ領域を 44px まで補う(Button と同じ方針)。
 */
export function resolveIconButtonAppearance(
  theme: AppTheme,
  args: { variant: IconButtonVariant; size: IconButtonSize; disabled: boolean; pressed: boolean },
): IconButtonAppearance {
  const { variant, size, disabled, pressed } = args;
  const sizeConfig = SIZE_CONFIG[size];
  const boxSize = theme.sizing[sizeConfig.boxSizeKey];
  const hitSlop = Math.max(0, Math.ceil((MIN_TOUCH_TARGET - boxSize) / 2));
  const palette = resolveVariantPalette(theme, variant, pressed);

  return {
    backgroundColor: palette.backgroundColor,
    iconColor: disabled ? theme.colors.textDisabled : palette.iconColor,
    borderColor: disabled ? theme.colors.border : palette.borderColor,
    borderWidth: palette.borderWidth,
    boxSize,
    iconSize: sizeConfig.iconSize,
    hitSlop,
    opacity: disabled ? 0.4 : 1,
    scale: pressed ? 0.97 : 1,
  };
}

type VariantPalette = {
  backgroundColor: string;
  iconColor: string;
  borderColor: string;
  borderWidth: number;
};

function resolveVariantPalette(
  theme: AppTheme,
  variant: IconButtonVariant,
  pressed: boolean,
): VariantPalette {
  switch (variant) {
    case "primary":
      return {
        backgroundColor: pressed ? theme.colors.primaryPressed : theme.colors.primary,
        iconColor: theme.colors.onPrimary,
        borderColor: "transparent",
        borderWidth: 0,
      };
    case "secondary":
      return {
        backgroundColor: pressed ? theme.colors.surfaceSunken : theme.colors.surface,
        iconColor: theme.colors.text,
        borderColor: theme.colors.borderStrong,
        borderWidth: theme.sizing.hairline,
      };
    case "ghost":
      return {
        backgroundColor: pressed ? theme.colors.surfaceSunken : "transparent",
        iconColor: theme.colors.text,
        borderColor: "transparent",
        borderWidth: 0,
      };
  }
}
