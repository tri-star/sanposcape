import type { AppTheme } from "@/theme/tokens";

export type SelectOptionLike<T extends string> = {
  value: T;
  label: string;
};

export type SelectAppearance = {
  borderColor: string;
  borderWidth: number;
  backgroundColor: string;
  textColor: string;
  placeholderColor: string;
  iconColor: string;
  opacity: number;
};

/**
 * disabled から Select トリガーの見た目を解決する純粋関数(見た目は Input に揃える)。
 * DS: 枠線は Input と同じく常に 1.5px 固定(design/components/DS-COMPONENT-SPECS.md)。
 */
export function resolveSelectAppearance(
  theme: AppTheme,
  args: { disabled: boolean },
): SelectAppearance {
  const { disabled } = args;
  return {
    borderColor: theme.colors.border,
    borderWidth: theme.sizing.hairline * 1.5,
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
