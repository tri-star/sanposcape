import type { Theme } from "@/theme/tokens";
import { withAlpha } from "@/theme/withAlpha";

/** 歩いた軌跡の線の不透明度。上に重ねても、下のルート線と地図が透けて見える程度にする。 */
const TRAIL_OPACITY = 0.7;
/** 歩いた軌跡の線の太さ（px）。ルート線（5）より細くし、重なったときにルート線の両端が見えるようにする。 */
const TRAIL_STROKE_WIDTH = 4;

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
 * - ルート線の**上**に細く重ねる。下に太く敷く（縁取りに見せる）案は、iOS の Apple Maps で成り立たない。
 *   Apple Maps では `Polyline` の `zIndex` が効かず、座標が変わるたびに線を一番上へ付け直すため、
 *   位置が届くたびに軌跡がルート線の上へ戻る。上に細く重ねる見た目なら、描く順序に左右されない。
 */
export function walkTrailStyle(theme: Pick<Theme, "colors">): WalkTrailStyle {
  return {
    color: withAlpha(theme.colors.accent, TRAIL_OPACITY),
    strokeWidth: TRAIL_STROKE_WIDTH,
  };
}
