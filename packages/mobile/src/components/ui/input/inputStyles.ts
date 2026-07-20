import type { AppTheme } from "@/theme/tokens";

export type InputAppearance = {
  borderColor: string;
  borderWidth: number;
  backgroundColor: string;
  textColor: string;
  placeholderColor: string;
  iconColor: string;
  helperColor: string;
  opacity: number;
};

/**
 * focused/disabled/hasError から Input の見た目を解決する純粋関数。
 * 優先順位は **error > disabled > focused**(3つが同時に true でも1つの見た目に確定させるため)。
 * フォーカスリングは持ち込まず、フォーカス時は枠色を primary 系(`borderFocus`)に変えるだけ。
 *
 * DS: 枠線幅は状態に関わらず常に 1.5px 固定で、色だけを変える(design/components/DS-COMPONENT-SPECS.md)。
 * RN では `borderWidth` が変わると内側のコンテンツ領域が縮むため、以前の実装(1px↔2px)は
 * フォーカスするたびにテキストが跳ねる不具合があった(B-7)。
 */
const BORDER_WIDTH_FACTOR = 1.5;

export function resolveInputAppearance(
  theme: AppTheme,
  args: { focused: boolean; disabled: boolean; hasError: boolean },
): InputAppearance {
  const { focused, disabled, hasError } = args;
  const borderWidth = theme.sizing.hairline * BORDER_WIDTH_FACTOR;

  if (hasError) {
    return {
      borderColor: theme.colors.danger,
      borderWidth,
      backgroundColor: theme.colors.surface,
      textColor: theme.colors.text,
      placeholderColor: theme.colors.textTertiary,
      iconColor: theme.colors.danger,
      helperColor: theme.colors.danger,
      opacity: 1,
    };
  }

  if (disabled) {
    return {
      borderColor: theme.colors.border,
      borderWidth,
      backgroundColor: theme.colors.surfaceSunken,
      textColor: theme.colors.textDisabled,
      placeholderColor: theme.colors.textDisabled,
      iconColor: theme.colors.textDisabled,
      helperColor: theme.colors.textTertiary,
      opacity: 0.6,
    };
  }

  return {
    borderColor: focused ? theme.colors.borderFocus : theme.colors.border,
    borderWidth,
    backgroundColor: theme.colors.surface,
    textColor: theme.colors.text,
    placeholderColor: theme.colors.textTertiary,
    iconColor: focused ? theme.colors.primary : theme.colors.textTertiary,
    helperColor: theme.colors.textTertiary,
    opacity: 1,
  };
}
