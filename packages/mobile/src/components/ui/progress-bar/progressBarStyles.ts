import type { AppTheme } from "@/theme/tokens";

export type ProgressBarSize = "sm" | "md";

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

const HEIGHT: Record<ProgressBarSize, keyof AppTheme["spacing"]> = {
  sm: 4,
  md: 8,
};

export function resolveProgressBarAppearance(
  theme: AppTheme,
  args: { value: number; size: ProgressBarSize; color?: string },
): ProgressBarAppearance {
  const { value, size, color } = args;
  const clamped = clampProgress(value);
  return {
    trackColor: theme.colors.border,
    fillColor: color ?? theme.colors.primary,
    height: theme.spacing[HEIGHT[size]],
    borderRadius: theme.radius.pill,
    fillWidthPercent: clamped * 100,
  };
}
