import type { Theme } from "@/theme/tokens";
import { withAlpha } from "@/theme/withAlpha";

/** 歩いた軌跡の線の不透明度。下に敷いたルート線と地図が透けて見える程度にする。 */
const TRAIL_OPACITY = 0.55;
/** 歩いた軌跡の線の太さ（px）。ルート線（5）より太くし、重なったときにルート線の縁取りとして見えるようにする。 */
const TRAIL_STROKE_WIDTH = 8;

export type WalkTrailStyle = {
  color: string;
  strokeWidth: number;
};

/**
 * 散歩中の地図に描く「歩いた軌跡」の線の見た目（SS-168）。線（`WalkRouteMapView`）と
 * 凡例の見本（`WalkRouteLegend`）で同じ値を使うために切り出している。
 *
 * - 色はアクセント（オレンジ）を半透明にする。ルート線（青の実線＝行き / 紺の破線＝帰り）と色相で区別する。
 *   トークンの値の SSoT は Claude Design のため（ADR-M-005 SS-202 追補）、新しいトークンは足さず既存の値から作る。
 * - 点線にしないのは、帰りの破線が丸い線端で「点線」に見えており紛らわしいため。
 */
export function walkTrailStyle(theme: Pick<Theme, "colors">): WalkTrailStyle {
  return {
    color: withAlpha(theme.colors.accent, TRAIL_OPACITY),
    strokeWidth: TRAIL_STROKE_WIDTH,
  };
}
