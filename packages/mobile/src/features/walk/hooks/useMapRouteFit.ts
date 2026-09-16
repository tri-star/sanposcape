import type { RefObject } from "react";
import { useEffect } from "react";
import type MapView from "react-native-maps";
import { regionForBounds } from "@/features/walk/lib/mapRegion";
import type { WalkRoute } from "@/features/walk/types";

/** プレビュー更新時に周回全体へフィット。散歩中は固定ルートの参照が変わらない。 */
export function useMapRouteFit(
  mapRef: RefObject<MapView | null>,
  walkRoute: WalkRoute | null,
  animationDurationMs: number,
): void {
  useEffect(() => {
    if (!walkRoute) return;
    mapRef.current?.animateToRegion(regionForBounds(walkRoute.bounds), animationDurationMs);
  }, [walkRoute, mapRef, animationDurationMs]);
}
