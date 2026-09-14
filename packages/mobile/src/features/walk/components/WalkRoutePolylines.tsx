import { RoutePolyline } from "@/components/ui/route-polyline/RoutePolyline";
import { walkRoutePolylineSegments } from "@/features/walk/lib/walkRouteLegs";
import type { WalkRoute } from "@/features/walk/types";
import { useTheme } from "@/theme/useTheme";

export type WalkRoutePolylinesProps = { walkRoute: WalkRoute };

/** 復路の破線パターン（線の長さ, 間隔。px）。 */
const RETURN_DASH_PATTERN = [12, 8];

/**
 * WalkRoutePolylines — 周回ルートの往路/復路を描き分けて `MapView` 直下に並べる。
 * `SpotMapView`（散歩開始）と `WalkRouteMapView`（散歩中）の両方から使う。
 * `Polyline` は `MapView` の直下でないと描画されないため、ラッパの `View` では包まず
 * Fragment を返す。
 */
export function WalkRoutePolylines({ walkRoute }: WalkRoutePolylinesProps) {
  const theme = useTheme();
  const segments = walkRoutePolylineSegments(walkRoute);

  return (
    <>
      {segments.map((segment) => (
        <RoutePolyline
          key={segment.kind}
          path={segment.path}
          {...(segment.kind === "return"
            ? { color: theme.map.routeReturn, dashPattern: RETURN_DASH_PATTERN, zIndex: 1 }
            : { color: theme.map.route, zIndex: 2 })}
        />
      ))}
    </>
  );
}
