import { useCallback, useState } from "react";

import { useWalkRoute } from "@/features/walk/hooks/useWalkRoute";
import { useWalkSession } from "@/features/walk/hooks/useWalkSession";
import { useWalkTracking } from "@/features/walk/hooks/useWalkTracking";
import type { ExploreErrorCode } from "@/features/walk/lib/exploreError";
import { estimateStepsFromMeters } from "@/features/walk/lib/walkStats";
import type { WalkTrackingStatus } from "@/features/walk/lib/walkTrackingStatus";
import { useActiveWalkStore } from "@/features/walk/store/useActiveWalkStore";
import type { ActiveWalk, WalkRoute } from "@/features/walk/types";
import type { GeoCoordinates, LocationErrorCode } from "@/services/location/types";

export type UseActiveWalkResult = {
  activeWalk: ActiveWalk | null;

  walkRoute: WalkRoute | null;
  isLoadingWalkRoute: boolean;
  walkRouteErrorCode: ExploreErrorCode | null;
  retryWalkRoute: () => void;

  elapsedSec: number;
  paused: boolean;
  togglePause: () => void;

  currentPosition: GeoCoordinates | null;
  distanceMeters: number;
  /** 実際に歩いた軌跡（M5 の散歩記録保存で使う。SS-16 時点では表示・保存のどちらにも未使用）。 */
  points: GeoCoordinates[];
  steps: number;
  trackingStatus: WalkTrackingStatus;
  trackingErrorCode: LocationErrorCode | null;
  /** 位置トラッキングを貼り直す（権限エラーからの復帰用）。 */
  retryTracking: () => void;

  /** store をクリアする。終了ダイアログの確定時に呼ぶ。 */
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

  const steps = estimateStepsFromMeters(tracking.distanceMeters);

  return {
    activeWalk,

    walkRoute: route.walkRoute,
    isLoadingWalkRoute: route.isLoading,
    walkRouteErrorCode: route.errorCode,
    retryWalkRoute: route.retry,

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

    finishWalk: endWalk,
  };
}
