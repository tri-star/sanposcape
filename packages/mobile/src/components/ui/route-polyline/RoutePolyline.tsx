import { Polyline } from "react-native-maps";

import type { GeoCoordinates } from "@/services/location/types";
import { useTheme } from "@/theme/useTheme";

export type RoutePolylineProps = {
  path: readonly GeoCoordinates[];
  /** 線色。省略時は theme.map.route。 */
  color?: string;
  /** 破線パターン [線の長さ, 間隔]（px）。省略時は実線。react-native-maps の lineDashPattern にそのまま渡す。 */
  dashPattern?: readonly number[];
  /** 省略時 5。 */
  strokeWidth?: number;
  /** 重なり順。省略時は未指定（react-native-maps の既定）。 */
  zIndex?: number;
};

/**
 * RoutePolyline — 3つの地図（散歩開始／散歩中／履歴詳細）でルート線・軌跡線の見た目を揃えるための
 * 極薄ラッパ。`MapView` の子としてのみ使う（`Polyline` は `MapView` の直下でないと描画されない）。
 * 元は `features/walk/components/WalkRoutePolyline.tsx`。SS-20 で `features/history` からも
 * 使うため `src/components/ui` へ昇格した（`MapPin` と同じカテゴリ）。
 * SS-33: 往路/復路の描き分けのため見た目の props を任意で受ける。
 */
export function RoutePolyline({
  path,
  color,
  dashPattern,
  strokeWidth,
  zIndex,
}: RoutePolylineProps) {
  const theme = useTheme();

  if (path.length < 2) {
    return null;
  }

  return (
    <Polyline
      coordinates={[...path]}
      strokeColor={color ?? theme.map.route}
      strokeWidth={strokeWidth ?? 5}
      lineDashPattern={dashPattern ? [...dashPattern] : undefined}
      zIndex={zIndex}
      lineCap="round"
      lineJoin="round"
    />
  );
}
