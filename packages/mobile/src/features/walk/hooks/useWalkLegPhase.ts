import { useEffect, useRef, useState } from "react";

import {
  INITIAL_WALK_LEG_STATE,
  observeWalkLeg,
  type WalkLegPhase,
  type WalkLegState,
} from "@/features/walk/lib/walkRouteLeg";
import type { WalkRoute } from "@/features/walk/types";
import type { GeoCoordinates } from "@/services/location/types";

export type UseWalkLegPhaseInput = {
  /** 表示中の実効ルート（`useWalkRouteRecalculation` の戻り値ではなく初期ルートを渡す。理由は下記）。 */
  route: WalkRoute | null;
  currentPosition: GeoCoordinates | null;
  /** 散歩の同一性。変わったらリセットする。 */
  walkKey: string | null;
};

/**
 * `observeWalkLeg` の状態を保持するだけの薄い副作用層。判定ロジックは一切持たない
 * （判定は `lib/walkRouteLeg.ts` の純粋関数に置き、Vitest で担保する）。
 */
export function useWalkLegPhase(input: UseWalkLegPhaseInput): WalkLegPhase {
  const { route, currentPosition, walkKey } = input;

  const [state, setState] = useState<WalkLegState>(INITIAL_WALK_LEG_STATE);

  // effect 内で同一 tick の判定に使うため、レンダーのたびに最新値を代入する
  // （`useWalkRouteRecalculation` の destinationRef 等と同じ手法）。
  const routeRef = useRef(route);
  routeRef.current = route;

  // 更新 effect の依存は currentPosition だけにする。route を依存に入れると同じ測位で
  // observeWalkLeg が二重に走り、ラッチの判定タイミングがぶれる。useWalkTracking は
  // 測位ごとに新しいオブジェクトを返すため、参照比較で「1測位1回」になる。
  useEffect(() => {
    if (currentPosition === null) return;
    setState((prev) =>
      observeWalkLeg(prev, { position: currentPosition, route: routeRef.current }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 測位1件につき1回だけ評価する（route は ref で読む）
  }, [currentPosition]);

  // 散歩の切り替わりで初期化する。
  useEffect(() => {
    setState(INITIAL_WALK_LEG_STATE);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 散歩が切り替わったときだけリセットする
  }, [walkKey]);

  return state.phase;
}
