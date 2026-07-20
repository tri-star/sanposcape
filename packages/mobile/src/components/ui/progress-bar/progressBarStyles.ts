import type { AppTheme } from "@/theme/tokens";

export type ProgressBarAppearance = {
  trackColor: string;
  fillColor: string;
  height: number;
  borderRadius: number;
  /** 0〜100 */
  fillWidthPercent: number;
};

/** 0〜1 の範囲にクランプする。NaN は 0、+Infinity は 1、-Infinity は 0 として扱う */
export function clampProgress(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

/**
 * DS の ProgressBar は高さ 10px の単一値(4px グリッドに乗らない。
 * design/components/DS-COMPONENT-SPECS.md)。以前の実装は `size` prop で
 * `theme.spacing` から高さを引いていたため 10px を表現できなかった(B-11)。
 * `size` prop 自体を削除し、DS 実寸のリテラル値に統一する。
 */
const TRACK_HEIGHT = 10;

export function resolveProgressBarAppearance(
  theme: AppTheme,
  args: { value: number; color?: string },
): ProgressBarAppearance {
  const { value, color } = args;
  const clamped = clampProgress(value);
  return {
    // DS: トラック色は `--ink-100`。`border`(`--ink-200`)の流用は用途の取り違えだった(B-10)。
    trackColor: theme.colors.neutralFill,
    fillColor: color ?? theme.colors.primary,
    height: TRACK_HEIGHT,
    borderRadius: theme.radius.pill,
    fillWidthPercent: clamped * 100,
  };
}
