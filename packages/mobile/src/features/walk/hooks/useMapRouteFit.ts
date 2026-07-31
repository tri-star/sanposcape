import type { RefObject } from "react";
import { useEffect } from "react";
import type MapView from "react-native-maps";

import { regionForBounds } from "@/features/walk/lib/mapRegion";
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
 * 依存は `walkRoute?.destination.placeId` のみ（ルートオブジェクトの参照ではなく
 * 「別ルートに変わったか」だけを見る。duration/distance 等の再取得で walkRoute の参照が
 * 変わっても再フィットしない）。
 */
export function useMapRouteFit(
  mapRef: RefObject<MapView | null>,
  walkRoute: WalkRoute | null,
  animationDurationMs: number,
): void {
  useEffect(() => {
    if (!walkRoute) return;
    mapRef.current?.animateToRegion(regionForBounds(walkRoute.bounds), animationDurationMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- walkRoute 全体ではなく placeId の変化だけを見る
  }, [walkRoute?.destination.placeId]);
}
