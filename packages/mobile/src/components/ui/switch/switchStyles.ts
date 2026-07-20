import { resolveHitSlop } from "@/lib/resolveHitSlop";
import type { AppTheme } from "@/theme/tokens";

export type SwitchAppearance = {
  trackColor: string;
  knobColor: string;
  /** DS: ノブは `shadow-xs` を持つ */
  knobBoxShadow: string;
  trackWidth: number;
  trackHeight: number;
  knobSize: number;
  /** ノブの左/上端の固定オフセット(トラック内で垂直中央になるよう選定済み) */
  knobInset: number;
  /** off=0, on=trackWidth - knobSize - knobInset*2 */
  knobTranslateX: number;
  /** 見た目のトラックが 44px 未満のとき、実タップ領域を 44px まで広げるための片側マージン */
  hitSlop: number;
  opacity: number;
};

/**
 * DS の Switch はトラック 44×26 / ノブ 20 / インセット3 の単一サイズのみ
 * (design/components/DS-COMPONENT-SPECS.md)。以前の実装は `sm`/`md` のサイズバリアントを
 * 独自に発明し、どちらも DS の実寸と一致していなかった。画面側での利用実績も無い(YAGNI)ため、
 * サイズ切り替えの `size` prop 自体を削除し、DS 実寸の単一サイズに統一する(B-5)。
 */
const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 26;
const KNOB_SIZE = 20;
const KNOB_INSET = 3;

/**
 * value/disabled から Switch の見た目を解決する純粋関数。
 * `react-native` / `react-native-reanimated` を import しない
 * (アニメーションの発火は呼び出し側の `Switch.tsx` の責務)。
 */
export function resolveSwitchAppearance(
  theme: AppTheme,
  args: { value: boolean; disabled: boolean },
): SwitchAppearance {
  const { value, disabled } = args;
  const hitSlop = resolveHitSlop(Math.min(TRACK_WIDTH, TRACK_HEIGHT));

  return {
    trackColor: value ? theme.colors.primary : theme.colors.border,
    // DS: ノブは常に #fff(テーマ非依存の固定値。design/components/DS-COMPONENT-SPECS.md)
    knobColor: "#fff",
    knobBoxShadow: theme.shadow.xs,
    trackWidth: TRACK_WIDTH,
    trackHeight: TRACK_HEIGHT,
    knobSize: KNOB_SIZE,
    knobInset: KNOB_INSET,
    knobTranslateX: value ? TRACK_WIDTH - KNOB_SIZE - KNOB_INSET * 2 : 0,
    hitSlop,
    opacity: disabled ? 0.4 : 1,
  };
}
