import { Polyline } from "react-native-maps";

import type { GeoCoordinates } from "@/services/location/types";
import { useTheme } from "@/theme/useTheme";

export type RoutePolylineProps = {
  path: readonly GeoCoordinates[];
};

/**
 * RoutePolyline — 3つの地図（散歩開始／散歩中／履歴詳細）でルート線・軌跡線の見た目を揃えるための
 * 極薄ラッパ。`MapView` の子としてのみ使う（`Polyline` は `MapView` の直下でないと描画されない）。
 * 元は `features/walk/components/WalkRoutePolyline.tsx`。SS-20 で `features/history` からも
 * 使うため `src/components/ui` へ昇格した（`MapPin` と同じカテゴリ）。
 */
export function RoutePolyline({ path }: RoutePolylineProps) {
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
