import type { AppTheme } from "@/theme/tokens";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonAppearance = {
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  paddingHorizontal: number;
  minHeight: number;
  /** 見た目の高さが 44px 未満のとき、実タップ領域を 44px まで広げるための片側マージン */
  hitSlop: number;
  opacity: number;
  scale: number;
};

const SIZE_CONFIG: Record<
  ButtonSize,
  { minHeightKey: keyof AppTheme["sizing"]; paddingHorizontal: keyof AppTheme["spacing"] }
> = {
  sm: { minHeightKey: "controlSm", paddingHorizontal: 16 },
  md: { minHeightKey: "controlMd", paddingHorizontal: 20 },
  lg: { minHeightKey: "controlLg", paddingHorizontal: 24 },
};

/** RN の推奨タップ領域(44px)。DS の `--control-md`(44px)が「min touch target」とコメントされている値と同じ */
const MIN_TOUCH_TARGET = 44;

/**
 * variant/size/状態(disabled/pressed) から Button の見た目を解決する純粋関数。
 * `react-native` / `react-native-unistyles` を import しない(Vitest で直接テストするため)。
 *
 * 【プランからの補正】DS の `--control-sm`(34px)は CSS 上「min touch target」と
 * コメントされていないため、sm サイズは見た目の高さ自体は 44px を下回る。
 * その代わり `hitSlop` を返し、呼び出し側(Button.tsx)が
 * `minHeight + hitSlop * 2 >= 44` を満たすように実タップ領域を広げる
 * (共通ルール「タップ領域は最低44×44。見た目が小さくても hitSlop で確保する」に準拠)。
 */
export function resolveButtonAppearance(
  theme: AppTheme,
  args: { variant: ButtonVariant; size: ButtonSize; disabled: boolean; pressed: boolean },
): ButtonAppearance {
  const { variant, size, disabled, pressed } = args;
  const sizeConfig = SIZE_CONFIG[size];
  const minHeight = theme.sizing[sizeConfig.minHeightKey];
  const paddingHorizontal = theme.spacing[sizeConfig.paddingHorizontal];
  const hitSlop = Math.max(0, Math.ceil((MIN_TOUCH_TARGET - minHeight) / 2));

  const palette = resolveVariantPalette(theme, variant, pressed);

  return {
    backgroundColor: palette.backgroundColor,
    textColor: disabled ? theme.colors.textDisabled : palette.textColor,
    borderColor: disabled ? theme.colors.border : palette.borderColor,
    borderWidth: palette.borderWidth,
    borderRadius: theme.radius.pill,
    paddingHorizontal,
    minHeight,
    hitSlop,
    opacity: disabled ? 0.4 : 1,
    scale: pressed ? 0.97 : 1,
  };
}

type VariantPalette = {
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  borderWidth: number;
};

function resolveVariantPalette(
  theme: AppTheme,
  variant: ButtonVariant,
  pressed: boolean,
): VariantPalette {
  switch (variant) {
    case "primary":
      return {
        backgroundColor: pressed ? theme.colors.primaryPressed : theme.colors.primary,
        textColor: theme.colors.onPrimary,
        borderColor: "transparent",
        borderWidth: 0,
      };
    case "secondary":
      return {
        backgroundColor: pressed ? theme.colors.surfaceSunken : theme.colors.surface,
        textColor: theme.colors.text,
        borderColor: theme.colors.borderStrong,
        borderWidth: theme.sizing.hairline,
      };
    case "ghost":
      return {
        backgroundColor: pressed ? theme.colors.primaryTint : "transparent",
        textColor: theme.colors.primary,
        borderColor: "transparent",
        borderWidth: 0,
      };
    case "danger":
      return {
        backgroundColor: pressed ? theme.colors.dangerTint : theme.colors.danger,
        textColor: pressed ? theme.colors.danger : theme.colors.onPrimary,
        borderColor: "transparent",
        borderWidth: 0,
      };
  }
}
