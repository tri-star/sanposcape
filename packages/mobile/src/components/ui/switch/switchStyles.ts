import type { AppTheme } from "@/theme/tokens";

export type SwitchSize = "sm" | "md";

export type SwitchAppearance = {
  trackColor: string;
  knobColor: string;
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

const MIN_TOUCH_TARGET = 44;

type SwitchSizeConfig = {
  trackWidth: number;
  trackHeight: number;
  knobSize: number;
  knobInset: number;
};

/**
 * Switch のトラック/ノブ寸法。DS にスイッチ専用のスケールトークンが無いため、
 * `Avatar` と同様に「トラック高さ = ノブ + 余白×2」となる実用的な値をこのコンポーネント内に
 * 定義する(SS-1 実装時点で確定値ではない。実データが確認できた時点で見直すこと)。
 */
const SIZE_CONFIG: Record<SwitchSize, SwitchSizeConfig> = {
  sm: { trackWidth: 40, trackHeight: 24, knobSize: 20, knobInset: 2 },
  md: { trackWidth: 48, trackHeight: 28, knobSize: 24, knobInset: 2 },
};

/**
 * value/disabled/size から Switch の見た目を解決する純粋関数。
 * `react-native` / `react-native-reanimated` を import しない
 * (アニメーションの発火は呼び出し側の `Switch.tsx` の責務)。
 */
export function resolveSwitchAppearance(
  theme: AppTheme,
  args: { value: boolean; disabled: boolean; size: SwitchSize },
): SwitchAppearance {
  const { value, disabled, size } = args;
  const config = SIZE_CONFIG[size];
  const minDimension = Math.min(config.trackWidth, config.trackHeight);
  const hitSlop = Math.max(0, Math.ceil((MIN_TOUCH_TARGET - minDimension) / 2));

  return {
    trackColor: value ? theme.colors.primary : theme.colors.border,
    knobColor: theme.colors.surface,
    trackWidth: config.trackWidth,
    trackHeight: config.trackHeight,
    knobSize: config.knobSize,
    knobInset: config.knobInset,
    knobTranslateX: value ? config.trackWidth - config.knobSize - config.knobInset * 2 : 0,
    hitSlop,
    opacity: disabled ? 0.4 : 1,
  };
}
