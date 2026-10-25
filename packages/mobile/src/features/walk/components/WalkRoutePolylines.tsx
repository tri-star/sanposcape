import { Platform } from "react-native";

import { RoutePolyline } from "@/components/ui/route-polyline/RoutePolyline";
import { walkReturnLineStyle } from "@/features/walk/lib/walkReturnLineStyle";
import { walkRoutePolylineSegments } from "@/features/walk/lib/walkRouteLegs";
import type { WalkRoute } from "@/features/walk/types";
import { useTheme } from "@/theme/useTheme";

export type WalkRoutePolylinesProps = { walkRoute: WalkRoute };

/**
 * 復路の線の太さと破線パターン。OS で値が違う（iOS は MapKit が破線の線を拡大して描くため。SS-232）。
 * `lineCap="round"` と組み合わさり「丸い点の点線」に見える（iOS は実機で未確認。ADR-M-008 決定9 の SS-232 追補）。凡例の破線見本（短い線）と少し違うが、
 * 許容して据え置いている（ADR-M-008 決定9）。
 */
const RETURN_LINE_STYLE = walkReturnLineStyle(Platform.OS);

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
                strokeWidth: RETURN_LINE_STYLE.strokeWidth,
                dashPattern: RETURN_LINE_STYLE.dashPattern,
                zIndex: RETURN_Z_INDEX,
              }
            : { color: theme.map.route, zIndex: OUTBOUND_Z_INDEX })}
        />
      ))}
    </>
  );
}
