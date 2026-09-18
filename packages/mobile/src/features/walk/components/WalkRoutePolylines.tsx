import { RoutePolyline } from "@/components/ui/route-polyline/RoutePolyline";
import { walkRoutePolylineSegments } from "@/features/walk/lib/walkRouteLegs";
import type { WalkRoute } from "@/features/walk/types";
import { useTheme } from "@/theme/useTheme";

export type WalkRoutePolylinesProps = { walkRoute: WalkRoute };

/**
 * 復路の破線パターン（線の長さ, 間隔。px）。
 * Android 実機確認（2026-09-16）: `RoutePolyline` の `lineCap="round"` と組み合わさり
 * 「丸い点の点線」に見え、凡例の破線見本（短い線）と少し違うが、許容して据え置いた。
 * 揃えたくなったら復路だけ `lineCap="butt"` にする（`RoutePolyline` に `lineCap` props を追加）。
 */
const RETURN_DASH_PATTERN = [12, 8];

/** 往路を上に重ねて描画するための zIndex（現在地ピンとの前後関係を見やすくする）。 */
const OUTBOUND_Z_INDEX = 2;
/** 復路の zIndex。往路より下に敷く。 */
const RETURN_Z_INDEX = 1;

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
            ? {
                color: theme.map.routeReturn,
                dashPattern: RETURN_DASH_PATTERN,
                zIndex: RETURN_Z_INDEX,
              }
            : { color: theme.map.route, zIndex: OUTBOUND_Z_INDEX })}
        />
      ))}
    </>
  );
}
