import { useMemo } from "react";
import { Polygon } from "react-native-maps";

import { headingBeamPolygon } from "@/components/ui/heading-beam/headingBeamGeometry";
import type { GeoCoordinates } from "@/services/location/types";
import { useTheme } from "@/theme/useTheme";
import { withAlpha } from "@/theme/withAlpha";

export type HeadingBeamProps = {
  /** 扇形の頂点（現在地）。 */
  center: GeoCoordinates;
  /** 向いている方向（北を 0 とした時計回りの度数）。 */
  headingDegrees: number;
  /** 扇形の半径（m）。`headingBeamRadiusMeters` で画面上の大きさから換算する。 */
  radiusMeters: number;
  /** 重なり順（Google Maps のみ）。省略時は react-native-maps の既定。 */
  zIndex?: number;
};

/** 扇形の塗りの不透明度。下の地図・ルート線が透けて見える程度にする。 */
const FILL_OPACITY = 0.22;
/** 扇形の縁の不透明度。 */
const STROKE_OPACITY = 0.45;

/**
 * HeadingBeam — 現在地から向いている方向へ開いた扇形（SS-169）。`MapView` の子としてのみ使う。
 *
 * マーカー（`Marker`）ではなく地図上の図形（`Polygon`）で描く。
 * - 地図を回転・傾けても地図に対する向きのまま描ける。`Marker` の `rotation` / `flat` は iOS の Apple Maps で効かない。
 * - タップを奪わない。`Marker` は Android で真上のタップを `MapView` に渡さない（#1132）ので、
 *   現在地まわりの地点選択（ピンタブのタップ・長押し）を塞いでしまう。`Polygon` は Android では既定でタップを受けず、
 *   iOS では図形のタップ判定の後に必ず地図の `onPress` も呼ばれるので、地図のタップを塞がない。
 * - 図形は距離（m）で描くので、画面上の大きさは呼び出し側がズームに合わせて半径を換算し直す。
 * - Google Maps では図形は常にマーカーより下に描かれる（現在地ピンは扇形の上に出る）。
 */
export function HeadingBeam({ center, headingDegrees, radiusMeters, zIndex }: HeadingBeamProps) {
  const theme = useTheme();
  const coordinates = useMemo(
    () => headingBeamPolygon({ center, headingDegrees, radiusMeters }),
    [center, headingDegrees, radiusMeters],
  );

  if (coordinates.length < 3) return null;

  return (
    <Polygon
      coordinates={coordinates}
      fillColor={withAlpha(theme.map.route, FILL_OPACITY)}
      strokeColor={withAlpha(theme.map.route, STROKE_OPACITY)}
      strokeWidth={1}
      zIndex={zIndex}
    />
  );
}
