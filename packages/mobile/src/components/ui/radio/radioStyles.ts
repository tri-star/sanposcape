import type { AppTheme } from "@/theme/tokens";

export type RadioAppearance = {
  borderColor: string;
  borderWidth: number;
  boxSize: number;
  dotSize: number;
  dotColor: string;
  showDot: boolean;
  /** 見た目の boxSize が 44px 未満のとき、実タップ領域を 44px まで広げるための片側マージン */
  hitSlop: number;
  opacity: number;
};

const MIN_TOUCH_TARGET = 44;
/** ラジオボタンの直径。Checkbox と揃えた実用値(DS に専用スケールが無いため) */
const BOX_SIZE = 22;
const DOT_SIZE = 10;

/**
 * selected/disabled から Radio の見た目を解決する純粋関数。
 * 角丸は常に完全な円(`radius.pill`)。グループ選択の排他制御はここでは扱わない
 * (呼び出し側(feature)の責務)。
 */
export function resolveRadioAppearance(
  theme: AppTheme,
  args: { selected: boolean; disabled: boolean },
): RadioAppearance {
  const { selected, disabled } = args;
  const hitSlop = Math.max(0, Math.ceil((MIN_TOUCH_TARGET - BOX_SIZE) / 2));

  return {
    borderColor: selected ? theme.colors.primary : theme.colors.borderStrong,
    borderWidth: theme.sizing.hairline * 2,
    boxSize: BOX_SIZE,
    dotSize: DOT_SIZE,
    dotColor: theme.colors.primary,
    showDot: selected,
    hitSlop,
    opacity: disabled ? 0.4 : 1,
  };
}
