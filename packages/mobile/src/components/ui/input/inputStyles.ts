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
 */
export function resolveInputAppearance(
  theme: AppTheme,
  args: { focused: boolean; disabled: boolean; hasError: boolean },
): InputAppearance {
  const { focused, disabled, hasError } = args;

  if (hasError) {
    return {
      borderColor: theme.colors.danger,
      borderWidth: theme.sizing.hairline * 2,
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
      borderWidth: theme.sizing.hairline,
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
    borderWidth: focused ? theme.sizing.hairline * 2 : theme.sizing.hairline,
    backgroundColor: theme.colors.surface,
    textColor: theme.colors.text,
    placeholderColor: theme.colors.textTertiary,
    iconColor: focused ? theme.colors.primary : theme.colors.textTertiary,
    helperColor: theme.colors.textTertiary,
    opacity: 1,
  };
}
