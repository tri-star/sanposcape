import type { RefObject } from "react";
import { useEffect } from "react";
import type MapView from "react-native-maps";

import { regionForBounds } from "@/features/walk/lib/mapRegion";
import { walkRouteFitKey } from "@/features/walk/lib/walkRoute";
import type { WalkRoute } from "@/features/walk/types";

/**
 * ルート（walkRoute）の bounds が変わったら地図をそこにフィットさせる共通 hook。
 * `SpotMapView`（散歩開始画面）・`WalkRouteMapView`（散歩中画面）の両方にあった
 * 「ルートが届いたら bounds に animateToRegion する」という同一の effect をここに集約する。
 *
 * 意図的にここへ含めていないもの（画面ごとに挙動が異なるため、共通化すると差異が
 * コードから読み取れなくなる）:
 * - `SpotMapView` の「ルート表示中は往復半径（`regionForRoundTrip`）での再センタリングを
 *   止める」ロジック（線が画面外に出るのを防ぐための抑止で、この hook の関知しないところ）。
 * - `WalkRouteMapView` の「現在地への再センタリング」（`recenterNonce` 起点で
 *   `regionForRoundTrip(currentPosition, ...)` を呼ぶ別系統の effect）。
 *
 * 依存は `walkRouteFitKey`（placeId + origin + destination 座標）。SS-35 の再計算では目的地が
 * 同じまま起点だけが変わるため、placeId だけを見ていると新ルートに地図がフィットしない
 * （`SpotMapView` は起点が固定なのでキーは実質変わらず、挙動は従来どおり）。
 * SS-33 の復路再計算では目的地が「出発地」に変わるためキーが変わり、周回から片道への
 * 切り替わりで地図が再フィットする。
 */
export function useMapRouteFit(
  mapRef: RefObject<MapView | null>,
  walkRoute: WalkRoute | null,
  animationDurationMs: number,
): void {
  useEffect(() => {
    if (!walkRoute) return;
    mapRef.current?.animateToRegion(regionForBounds(walkRoute.bounds), animationDurationMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- walkRoute 全体ではなく walkRouteFitKey（placeId+origin）の変化だけを見る
  }, [walkRouteFitKey(walkRoute)]);
}
