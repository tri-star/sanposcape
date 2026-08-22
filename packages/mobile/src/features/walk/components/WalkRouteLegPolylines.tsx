import { RoutePolyline } from "@/components/ui/route-polyline/RoutePolyline";
import {
  findWalkRouteLeg,
  hasDistinctLegs,
  type WalkLegPhase,
} from "@/features/walk/lib/walkRouteLeg";
import type { WalkRoute } from "@/features/walk/types";
import { useTheme } from "@/theme/useTheme";

export type WalkRouteLegPolylinesProps = {
  walkRoute: WalkRoute;
  /**
   * 進行中の区間。指定すると該当 leg を太く・前面に描く。
   * 散歩開始画面（まだ歩いていない）では省略する。
   */
  activeLeg?: WalkLegPhase;
};

/** 破線パターン `[線分長, 間隔]`（px）。復路の描き分けに使う。 */
const RETURN_DASH_PATTERN = [12, 8];

/**
 * WalkRouteLegPolylines — 「周回を1本で描くか、往路/復路を2本で描き分けるか」の分岐を1箇所に閉じる。
 * 散歩開始画面（`SpotMapView`）と散歩中画面（`WalkRouteMapView`）の両方から使う。
 *
 * `Fragment` を返す（`View` などで包んではいけない）。`Polyline` は `MapView` の直下でなければ
 * 描画されない（`RoutePolyline.tsx` の既存 JSDoc と同じ制約）。カスタムコンポーネントは RN の
 * ツリーで平坦化されるため Fragment なら問題ない（`RoutePolyline` 自体が既に同じ形で動作している）。
 * 万一実機で描画されない場合の退避策: このコンポーネントを使わず、各 MapView に `RoutePolyline` を
 * 2つ直接並べる（ロジックは `hasDistinctLegs` / `findWalkRouteLeg` に残るので差分は小さい）。
 *
 * `useTheme()` を使うので `.tsx`。テストは書かない（Vitest はコンポーネントを描画できない）。
 * 分岐の判断は `hasDistinctLegs` / `findWalkRouteLeg`（`lib/walkRouteLeg.test.ts`）で担保する。
 */
export function WalkRouteLegPolylines({ walkRoute, activeLeg }: WalkRouteLegPolylinesProps) {
  const theme = useTheme();

  if (!hasDistinctLegs(walkRoute)) {
    // フォールバック（復路=往路）や片道の再計算では、legs があっても同じ線を2回描くことに
    // なるため往路 leg（あれば）を優先し、無ければ周回全体の path をそのまま1本描く。
    const singlePath = findWalkRouteLeg(walkRoute, "outbound")?.path ?? walkRoute.path;
    return <RoutePolyline path={singlePath} />;
  }

  const outboundLeg = findWalkRouteLeg(walkRoute, "outbound");
  const returnLeg = findWalkRouteLeg(walkRoute, "return");

  return (
    <>
      {outboundLeg ? (
        <RoutePolyline
          path={outboundLeg.path}
          color={theme.map.route}
          strokeWidth={activeLeg === "outbound" ? 6 : activeLeg === undefined ? 5 : 4}
          zIndex={activeLeg === "outbound" ? 2 : 1}
        />
      ) : null}
      {returnLeg ? (
        <RoutePolyline
          path={returnLeg.path}
          color={theme.map.routeReturn}
          dashPattern={RETURN_DASH_PATTERN}
          strokeWidth={activeLeg === "return" ? 6 : activeLeg === undefined ? 5 : 4}
          zIndex={activeLeg === "return" ? 2 : 1}
        />
      ) : null}
    </>
  );
}
