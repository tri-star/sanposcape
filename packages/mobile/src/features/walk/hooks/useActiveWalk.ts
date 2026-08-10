import { useCallback, useState } from "react";

import { useWalkRoute } from "@/features/walk/hooks/useWalkRoute";
import { useWalkRouteRecalculation } from "@/features/walk/hooks/useWalkRouteRecalculation";
import { useWalkSession } from "@/features/walk/hooks/useWalkSession";
import { useWalkTracking } from "@/features/walk/hooks/useWalkTracking";
import type { ExploreErrorCode } from "@/features/walk/lib/exploreError";
import { buildFinishedWalk } from "@/features/walk/lib/finishedWalk";
import { walkRouteNoticeKind } from "@/features/walk/lib/walkRouteNotice";
import type { WalkRouteNoticeKind } from "@/features/walk/lib/walkRouteNotice";
import { estimateStepsFromMeters } from "@/features/walk/lib/walkStats";
import type { WalkTrackingStatus } from "@/features/walk/lib/walkTrackingStatus";
import { useActiveWalkStore } from "@/features/walk/store/useActiveWalkStore";
import { useFinishedWalkStore } from "@/features/walk/store/useFinishedWalkStore";
import type { ActiveWalk, WalkRoute, WalkRouteRecalcStatus } from "@/features/walk/types";
import type { GeoCoordinates, LocationErrorCode } from "@/services/location/types";

export type UseActiveWalkResult = {
  activeWalk: ActiveWalk | null;

  /** 表示すべき実効ルート（再計算成功後は現在地起点の新ルート）。 */
  walkRoute: WalkRoute | null;
  /** 実効ルートが再計算由来か（ヘッダーの表記を「片道」→「ここから」に切り替える）。 */
  isRouteRecalculated: boolean;
  isLoadingWalkRoute: boolean;
  walkRouteErrorCode: ExploreErrorCode | null;
  retryWalkRoute: () => void;
  routeRecalcStatus: WalkRouteRecalcStatus;
  routeRecalcErrorCode: ExploreErrorCode | null;
  canRecalculateRoute: boolean;
  recalculateRoute: () => void;
  /** どの通知を出すか（純粋関数の結果）。 */
  routeNoticeKind: WalkRouteNoticeKind;

  elapsedSec: number;
  paused: boolean;
  togglePause: () => void;

  currentPosition: GeoCoordinates | null;
  distanceMeters: number;
  /** 実際に歩いた軌跡（散歩記録の保存に使う）。 */
  points: GeoCoordinates[];
  steps: number;
  trackingStatus: WalkTrackingStatus;
  trackingErrorCode: LocationErrorCode | null;
  /** 位置トラッキングを貼り直す（権限エラーからの復帰用）。 */
  retryTracking: () => void;

  /**
   * 軌跡・時間・距離を確定してドラフトを積み（`useFinishedWalkStore`）、
   * 進行中の散歩を終了する（`useActiveWalkStore`）。終了ダイアログの確定時に呼ぶ。
   * 保存自体はサマリ画面（`useWalkSummary`）が行う。
   */
  finishWalk: () => void;
};

/**
 * 散歩中画面が必要とするものを1つに束ねる合成 hook。
 * `WalkActiveView` から UI 以外のロジックを追い出すための境界。
 *
 * hook は条件分岐で呼ばない（activeWalk === null でも全部呼び、enabled/引数で無効化する）。
 */
export function useActiveWalk(): UseActiveWalkResult {
  const activeWalk = useActiveWalkStore((state) => state.activeWalk);
  const endWalk = useActiveWalkStore((state) => state.endWalk);
  const finishWalkDraft = useFinishedWalkStore((state) => state.finishWalk);

  // 散歩開始画面と同じ入力（origin, destination）になるため、TanStack Query のキャッシュに
  // 当たり追加の API 呼び出しは発生しない。
  const route = useWalkRoute({
    origin: activeWalk?.origin ?? null,
    destination: activeWalk?.destination ?? null,
  });

  const session = useWalkSession(activeWalk?.startedAtMs ?? 0);

  const [trackingAttempt, setTrackingAttempt] = useState(0);
  const tracking = useWalkTracking({
    enabled: activeWalk !== null,
    paused: session.paused,
    initialPosition: activeWalk?.origin ?? null,
    attempt: trackingAttempt,
  });
  const retryTracking = useCallback(() => setTrackingAttempt((n) => n + 1), []);

  // tracking（useWalkTracking）と session（useWalkSession）より後に置く必要がある
  // （現在地・一時停止状態が確定してから合成するため）。
  const recalc = useWalkRouteRecalculation({
    activeWalk,
    baseRoute: route.walkRoute,
    currentPosition: tracking.currentPosition,
    paused: session.paused,
  });

  const steps = estimateStepsFromMeters(tracking.distanceMeters);

  // elapsedSec/distanceMeters/points は毎秒変わるため useCallback で固定しない
  // （onPress からの単発呼び出しなので実害はない）。
  function finishWalk(): void {
    if (activeWalk === null) return;
    finishWalkDraft(
      buildFinishedWalk({
        activeWalk,
        elapsedSec: session.elapsedSec,
        distanceMeters: tracking.distanceMeters,
        points: tracking.points,
        endedAtMs: Date.now(),
      }),
    );
    endWalk();
  }

  return {
    activeWalk,

    walkRoute: recalc.route,
    isRouteRecalculated: recalc.isRecalculated,
    isLoadingWalkRoute: route.isLoading,
    walkRouteErrorCode: route.errorCode,
    retryWalkRoute: route.retry,
    routeRecalcStatus: recalc.status,
    routeRecalcErrorCode: recalc.errorCode,
    canRecalculateRoute: recalc.canRecalculate,
    recalculateRoute: recalc.recalculate,
    routeNoticeKind: walkRouteNoticeKind({
      hasRoute: recalc.route !== null,
      baseErrorCode: route.errorCode,
      recalcStatus: recalc.status,
      canRecalculate: recalc.canRecalculate,
    }),

    elapsedSec: session.elapsedSec,
    paused: session.paused,
    togglePause: session.togglePause,

    currentPosition: tracking.currentPosition,
    distanceMeters: tracking.distanceMeters,
    points: tracking.points,
    steps,
    trackingStatus: tracking.status,
    trackingErrorCode: tracking.errorCode,
    retryTracking,

    finishWalk,
  };
}
