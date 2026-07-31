import { useEffect, useRef, useState } from "react";

import { INITIAL_WALK_TRACK, appendWalkTrackPoint, resumeWalkTrack } from "@/features/walk/lib/walkTrack";
import type { WalkTrackState } from "@/features/walk/lib/walkTrack";
import type { WalkTrackingStatus } from "@/features/walk/lib/walkTrackingStatus";
import { locationService } from "@/services/location";
import { toLocationError } from "@/services/location/locationError";
import type {
  GeoCoordinates,
  LocationErrorCode,
  LocationSubscription,
} from "@/services/location/types";

export type UseWalkTrackingResult = {
  currentPosition: GeoCoordinates | null;
  distanceMeters: number;
  /** 実際に歩いた軌跡（表示用。保存は M5）。 */
  points: GeoCoordinates[];
  status: WalkTrackingStatus;
  errorCode: LocationErrorCode | null;
};

/**
 * `locationService.watchPosition` を購読し、現在地・実測距離・軌跡・トラッキング状態を返す。
 * RN 依存の副作用層なので Vitest 対象外（ロジックは `lib/walkTrack.ts` でテストする）。
 *
 * `@/services/location` のバレルを import するのはこの hook だけにする
 * （`lib/` から import するとネイティブ依存に到達するため。architecture-guideline の単体テスト節）。
 */
export function useWalkTracking(input: {
  /** 散歩中のみ true。false のときは購読しない。 */
  enabled: boolean;
  paused: boolean;
  /** 最初の fix が来るまでの表示に使う（= ActiveWalk.origin）。 */
  initialPosition: GeoCoordinates | null;
  /**
   * 再購読のトリガ。インクリメントされるたびに watchPosition を貼り直す。
   * 権限エラー後にユーザーが設定アプリで許可して戻ってきたケースを救うためのもの。
   */
  attempt: number;
}): UseWalkTrackingResult {
  const { enabled, paused, initialPosition, attempt } = input;

  const [track, setTrack] = useState<WalkTrackState>(INITIAL_WALK_TRACK);
  const [currentPosition, setCurrentPosition] = useState<GeoCoordinates | null>(initialPosition);
  const [errorCode, setErrorCode] = useState<LocationErrorCode | null>(null);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    setErrorCode(null);
    if (!enabled) return;

    let cancelled = false;
    let subscription: LocationSubscription | null = null;

    function handlePosition(position: GeoCoordinates) {
      setCurrentPosition(position);
      if (pausedRef.current) return;
      setTrack((prev) => appendWalkTrackPoint(prev, position));
    }

    async function start() {
      try {
        const sub = await locationService.watchPosition(handlePosition);
        if (cancelled) {
          sub.remove();
          return;
        }
        subscription = sub;
      } catch (error) {
        if (cancelled) return;
        setErrorCode(toLocationError(error).code);
      }
    }

    void start();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 再購読は enabled/attempt のみで行う
  }, [enabled, attempt]);

  useEffect(() => {
    if (!paused) {
      setTrack(resumeWalkTrack);
    }
  }, [paused]);

  const status: WalkTrackingStatus = !enabled
    ? "idle"
    : errorCode !== null
      ? "error"
      : track.points.length === 0
        ? "acquiring"
        : "tracking";

  return {
    currentPosition,
    distanceMeters: track.distanceMeters,
    points: track.points,
    status,
    errorCode,
  };
}
