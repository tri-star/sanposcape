import type { AppTheme } from "@/theme/tokens";

export type CheckboxState = "unchecked" | "checked" | "indeterminate";

export type CheckboxAppearance = {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  boxSize: number;
  iconColor: string;
  iconName: "check" | "minus" | null;
  /** 見た目の boxSize が 44px 未満のとき、実タップ領域を 44px まで広げるための片側マージン */
  hitSlop: number;
  opacity: number;
};

const MIN_TOUCH_TARGET = 44;
/** チェックボックスの一辺。DS にチェックボックス専用のスケールが無いため実用値を定義する */
const BOX_SIZE = 22;

function resolveCheckboxState(args: { checked: boolean; indeterminate: boolean }): CheckboxState {
  if (args.indeterminate) {
    return "indeterminate";
  }
  return args.checked ? "checked" : "unchecked";
}

/**
 * checked/indeterminate/disabled から Checkbox の見た目を解決する純粋関数。
 * 角丸は `radius.xs`(6px)。「4px 未満の角丸を作らない」規律を満たしつつ
 * コントロールの角丸(`radius.md`)より小さめにする。
 */
export function resolveCheckboxAppearance(
  theme: AppTheme,
  args: { checked: boolean; indeterminate: boolean; disabled: boolean },
): CheckboxAppearance {
  const { checked, indeterminate, disabled } = args;
  const state = resolveCheckboxState({ checked, indeterminate });
  const filled = state !== "unchecked";
  const hitSlop = Math.max(0, Math.ceil((MIN_TOUCH_TARGET - BOX_SIZE) / 2));

  return {
    backgroundColor: filled ? theme.colors.primary : theme.colors.surface,
    borderColor: filled ? theme.colors.primary : theme.colors.borderStrong,
    borderWidth: theme.sizing.hairline,
    borderRadius: theme.radius.xs,
    boxSize: BOX_SIZE,
    iconColor: theme.colors.onPrimary,
    iconName: state === "checked" ? "check" : state === "indeterminate" ? "minus" : null,
    hitSlop,
    opacity: disabled ? 0.4 : 1,
  };
}
