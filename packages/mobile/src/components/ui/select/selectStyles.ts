import type { AppTheme } from "@/theme/tokens";

export type SelectOptionLike<T extends string> = {
  value: T;
  label: string;
};

export type SelectAppearance = {
  borderColor: string;
  backgroundColor: string;
  textColor: string;
  placeholderColor: string;
  iconColor: string;
  opacity: number;
};

/** disabled から Select トリガーの見た目を解決する純粋関数(見た目は Input に揃える) */
export function resolveSelectAppearance(
  theme: AppTheme,
  args: { disabled: boolean },
): SelectAppearance {
  const { disabled } = args;
  return {
    borderColor: theme.colors.border,
    backgroundColor: disabled ? theme.colors.surfaceSunken : theme.colors.surface,
    textColor: disabled ? theme.colors.textDisabled : theme.colors.text,
    placeholderColor: theme.colors.textTertiary,
    iconColor: disabled ? theme.colors.textDisabled : theme.colors.textTertiary,
    opacity: disabled ? 0.6 : 1,
  };
}

/**
 * トリガーに表示するラベルを解決する純粋関数。
 * 値なし → placeholder、値あり → 該当 label、options に無い値 → placeholder にフォールバックする。
 */
export function resolveSelectDisplayLabel<T extends string>(
  value: T | null,
  options: SelectOptionLike<T>[],
  placeholder: string,
): string {
  if (value === null) {
    return placeholder;
  }
  const found = options.find((option) => option.value === value);
  return found ? found.label : placeholder;
}
