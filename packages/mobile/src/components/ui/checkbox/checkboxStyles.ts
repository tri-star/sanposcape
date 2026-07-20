import { resolveHitSlop } from "@/lib/resolveHitSlop";
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
  /** DS: チェックアイコンは 14px、strokeWidth 3(design/components/DS-COMPONENT-SPECS.md) */
  iconSize: number;
  iconStrokeWidth: number;
  /** 見た目の boxSize が 44px 未満のとき、実タップ領域を 44px まで広げるための片側マージン */
  hitSlop: number;
  opacity: number;
};

/** チェックボックスの一辺。DS 実物と一致(22×22。design/components/DS-COMPONENT-SPECS.md) */
const BOX_SIZE = 22;
const ICON_SIZE = 14;
const ICON_STROKE_WIDTH = 3;

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
  const hitSlop = resolveHitSlop(BOX_SIZE);

  return {
    backgroundColor: filled ? theme.colors.primary : theme.colors.surface,
    borderColor: filled ? theme.colors.primary : theme.colors.borderStrong,
    // DS: 非選択の枠線は 1.5px 固定(以前は hairline 1x のみで僅かに細かった。Radio/Input と統一)
    borderWidth: theme.sizing.hairline * 1.5,
    borderRadius: theme.radius.xs,
    boxSize: BOX_SIZE,
    iconColor: theme.colors.onPrimary,
    iconName: state === "checked" ? "check" : state === "indeterminate" ? "minus" : null,
    iconSize: ICON_SIZE,
    iconStrokeWidth: ICON_STROKE_WIDTH,
    hitSlop,
    opacity: disabled ? 0.4 : 1,
  };
}
