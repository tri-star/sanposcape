import type { AppTheme } from "@/theme/tokens";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
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
  /** `primary` かつ非 disabled のときのみ `shadow-sm`。他 variant は undefined(影なし) */
  boxShadow: string | undefined;
};

/**
 * 水平パディングは DS 実物(components/core/Button.jsx)の値(16/22/28)。
 * DS の spacing スケールに厳密には乗らない値のため、theme.spacing のキーではなく
 * リテラル値で持つ(design/components/DS-COMPONENT-SPECS.md の Button 表を参照)。
 */
const SIZE_CONFIG: Record<
  ButtonSize,
  { minHeightKey: keyof AppTheme["sizing"]; paddingHorizontal: number }
> = {
  sm: { minHeightKey: "controlSm", paddingHorizontal: 16 },
  md: { minHeightKey: "controlMd", paddingHorizontal: 22 },
  lg: { minHeightKey: "controlLg", paddingHorizontal: 28 },
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
  const paddingHorizontal = sizeConfig.paddingHorizontal;
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
    // DS: primary かつ非 disabled のときのみ shadow-sm(design/components/DS-COMPONENT-SPECS.md)
    boxShadow: variant === "primary" && !disabled ? theme.shadow.sm : undefined,
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
      // DS: 背景 primary-tint(枠線なし)。secondary は outline と違い枠を持たない。
      // 押下時は secondaryPressed(`--blue-300`)まで一段暗くする。
      return {
        backgroundColor: pressed ? theme.colors.secondaryPressed : theme.colors.primaryTint,
        textColor: theme.colors.primary,
        borderColor: "transparent",
        borderWidth: 0,
      };
    case "outline":
      // DS: 透明背景 + 1.5px border-strong(B-4。DS は primary/secondary/outline/ghost/danger の5種)
      return {
        backgroundColor: pressed ? theme.colors.surfaceSunken : "transparent",
        textColor: theme.colors.text,
        borderColor: theme.colors.borderStrong,
        borderWidth: theme.sizing.hairline * 1.5,
      };
    case "ghost":
      return {
        backgroundColor: pressed ? theme.colors.primaryTint : "transparent",
        textColor: theme.colors.primary,
        borderColor: "transparent",
        borderWidth: 0,
      };
    case "danger":
      // DS: 押下は red-600 に「暗く」する(readme の press 原則)。文字は白のまま(B-3)。
      return {
        backgroundColor: pressed ? theme.colors.dangerPressed : theme.colors.danger,
        textColor: theme.colors.onPrimary,
        borderColor: "transparent",
        borderWidth: 0,
      };
  }
}
