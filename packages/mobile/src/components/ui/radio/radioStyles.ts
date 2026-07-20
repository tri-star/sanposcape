import { resolveHitSlop } from "@/lib/resolveHitSlop";
import type { AppTheme } from "@/theme/tokens";

export type RadioAppearance = {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  boxSize: number;
  /** 見た目の boxSize が 44px 未満のとき、実タップ領域を 44px まで広げるための片側マージン */
  hitSlop: number;
  opacity: number;
};

/** ラジオボタンの直径。Checkbox と揃えた実用値(DS の Checkbox/Radio 共通スケール 22) */
const BOX_SIZE = 22;
/** DS: 非選択の枠線幅 */
const UNSELECTED_BORDER_WIDTH = 1.5;
/** DS: 選択時は枠線を太くして中央のドットを作る(細い枠 + 別要素のドットではない) */
const SELECTED_BORDER_WIDTH = 6;

/**
 * selected/disabled から Radio の見た目を解決する純粋関数。
 * 角丸は常に完全な円(`radius.pill`)。グループ選択の排他制御はここでは扱わない
 * (呼び出し側(feature)の責務)。
 *
 * DS: 選択状態は「細い枠の色を変える」のではなく、**枠線を 6px の `primary` に太らせる**ことで
 * 中央のドットを表現する(`box-sizing: border-box` 相当)。以前の実装は枠線幅を変えず色だけを
 * primary にしていたため、選択時に別要素で中央ドットを描画する必要があった(DS 差異。B 追加分)。
 */
export function resolveRadioAppearance(
  theme: AppTheme,
  args: { selected: boolean; disabled: boolean },
): RadioAppearance {
  const { selected, disabled } = args;
  const hitSlop = resolveHitSlop(BOX_SIZE);

  return {
    backgroundColor: theme.colors.surface,
    borderColor: selected ? theme.colors.primary : theme.colors.borderStrong,
    borderWidth: selected ? SELECTED_BORDER_WIDTH : UNSELECTED_BORDER_WIDTH,
    boxSize: BOX_SIZE,
    hitSlop,
    opacity: disabled ? 0.4 : 1,
  };
}
