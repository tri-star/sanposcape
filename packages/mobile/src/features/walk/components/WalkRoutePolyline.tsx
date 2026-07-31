import { Polyline } from "react-native-maps";

import type { GeoCoordinates } from "@/services/location/types";
import { useTheme } from "@/theme/useTheme";

export type WalkRoutePolylineProps = {
  path: readonly GeoCoordinates[];
};

/**
 * WalkRoutePolyline — 2つの地図（散歩開始／散歩中）でルート線の見た目を揃えるための極薄ラッパ。
 * `MapView` の子としてのみ使う（`Polyline` は `MapView` の直下でないと描画されない）。
 */
export function WalkRoutePolyline({ path }: WalkRoutePolylineProps) {
  const theme = useTheme();

  if (path.length < 2) {
    return null;
  }

  return (
    <Polyline
      coordinates={[...path]}
      strokeColor={theme.map.route}
      strokeWidth={5}
      lineCap="round"
      lineJoin="round"
    />
  );
}
